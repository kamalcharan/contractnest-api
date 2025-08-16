// src/docs/resources.swagger.ts
export const resourcesSwaggerDocs = {
  tags: [
    {
      name: 'Resources',
      description: 'Catalog Resources Management API'
    },
    {
      name: 'Resource Types',
      description: 'Resource Types Management API'
    }
  ],
  
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    
    schemas: {
      Resource: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique resource identifier'
          },
          resource_type_id: {
            type: 'string',
            description: 'Resource type identifier',
            example: 'team_staff'
          },
          name: {
            type: 'string',
            description: 'Resource name (internal identifier)',
            example: 'john_doe'
          },
          display_name: {
            type: 'string',
            description: 'Display name for UI',
            example: 'John Doe'
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Resource description',
            example: 'Senior Software Engineer'
          },
          hexcolor: {
            type: 'string',
            pattern: '^#[0-9A-Fa-f]{6}$',
            description: 'Hex color code for UI display',
            example: '#40E0D0'
          },
          icon_name: {
            type: 'string',
            nullable: true,
            description: 'Icon identifier for UI',
            example: 'user'
          },
          sequence_no: {
            type: 'integer',
            minimum: 1,
            description: 'Display order sequence',
            example: 1
          },
          contact_id: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Associated contact ID (for team_staff resources)'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string'
            },
            nullable: true,
            description: 'Resource tags for categorization',
            example: ['engineering', 'senior']
          },
          form_settings: {
            type: 'object',
            nullable: true,
            description: 'Custom form configuration settings'
          },
          is_active: {
            type: 'boolean',
            description: 'Whether the resource is active',
            example: true
          },
          is_deletable: {
            type: 'boolean',
            description: 'Whether the resource can be deleted',
            example: true
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Creation timestamp'
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp'
          },
          contact: {
            type: 'object',
            nullable: true,
            properties: {
              id: {
                type: 'string',
                format: 'uuid'
              },
              first_name: {
                type: 'string'
              },
              last_name: {
                type: 'string'
              },
              email: {
                type: 'string',
                format: 'email'
              },
              contact_classification: {
                type: 'string',
                enum: ['team_member', 'customer', 'vendor']
              }
            }
          }
        },
        required: ['id', 'resource_type_id', 'name', 'display_name', 'is_active', 'is_deletable']
      },
      
      ResourceType: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Resource type identifier',
            example: 'team_staff'
          },
          name: {
            type: 'string',
            description: 'Resource type name',
            example: 'Team Staff'
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Resource type description'
          },
          icon_name: {
            type: 'string',
            nullable: true,
            description: 'Icon for this resource type'
          },
          sort_order: {
            type: 'integer',
            description: 'Display order'
          },
          is_active: {
            type: 'boolean',
            description: 'Whether the type is active'
          }
        },
        required: ['id', 'name', 'is_active']
      },
      
      CreateResourceRequest: {
        type: 'object',
        properties: {
          resource_type_id: {
            type: 'string',
            description: 'Resource type identifier',
            example: 'team_staff'
          },
          name: {
            type: 'string',
            description: 'Resource name (internal identifier)',
            example: 'john_doe'
          },
          display_name: {
            type: 'string',
            description: 'Display name for UI',
            example: 'John Doe'
          },
          description: {
            type: 'string',
            description: 'Resource description',
            example: 'Senior Software Engineer'
          },
          hexcolor: {
            type: 'string',
            pattern: '^#[0-9A-Fa-f]{6}$',
            description: 'Hex color code for UI display',
            example: '#40E0D0'
          },
          icon_name: {
            type: 'string',
            description: 'Icon identifier for UI',
            example: 'user'
          },
          sequence_no: {
            type: 'integer',
            minimum: 1,
            description: 'Display order sequence'
          },
          contact_id: {
            type: 'string',
            format: 'uuid',
            description: 'Associated contact ID (for team_staff resources)'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Resource tags for categorization'
          },
          form_settings: {
            type: 'object',
            description: 'Custom form configuration settings'
          },
          is_active: {
            type: 'boolean',
            description: 'Whether the resource is active',
            default: true
          },
          is_deletable: {
            type: 'boolean',
            description: 'Whether the resource can be deleted',
            default: true
          }
        },
        required: ['resource_type_id', 'name', 'display_name']
      },
      
      UpdateResourceRequest: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Resource name (internal identifier)'
          },
          display_name: {
            type: 'string',
            description: 'Display name for UI'
          },
          description: {
            type: 'string',
            description: 'Resource description'
          },
          hexcolor: {
            type: 'string',
            pattern: '^#[0-9A-Fa-f]{6}$',
            description: 'Hex color code for UI display'
          },
          icon_name: {
            type: 'string',
            description: 'Icon identifier for UI'
          },
          sequence_no: {
            type: 'integer',
            minimum: 1,
            description: 'Display order sequence'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Resource tags for categorization'
          },
          form_settings: {
            type: 'object',
            description: 'Custom form configuration settings'
          },
          is_active: {
            type: 'boolean',
            description: 'Whether the resource is active'
          },
          is_deletable: {
            type: 'boolean',
            description: 'Whether the resource can be deleted'
          }
        }
      },
      
      ApiResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            description: 'Request success status'
          },
          data: {
            description: 'Response data'
          },
          message: {
            type: 'string',
            description: 'Response message'
          },
          requestId: {
            type: 'string',
            description: 'Request tracking ID'
          }
        },
        required: ['success']
      },
      
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Error message'
          },
          details: {
            type: 'string',
            description: 'Detailed error information'
          },
          requestId: {
            type: 'string',
            description: 'Request tracking ID'
          }
        },
        required: ['error']
      },
      
      NextSequenceResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            properties: {
              nextSequence: {
                type: 'integer',
                description: 'Next available sequence number',
                example: 5
              }
            }
          },
          requestId: {
            type: 'string'
          }
        }
      }
    }
  },
  
  paths: {
    '/api/resources': {
      get: {
        tags: ['Resources'],
        summary: 'Get all resources',
        description: 'Retrieve all resources for the tenant, optionally filtered by resource type',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'header',
            name: 'x-tenant-id',
            required: true,
            schema: {
              type: 'string'
            },
            description: 'Tenant identifier'
          },
          {
            in: 'query',
            name: 'resourceTypeId',
            required: false,
            schema: {
              type: 'string'
            },
            description: 'Filter by resource type ID'
          },
          {
            in: 'query',
            name: 'nextSequence',
            required: false,
            schema: {
              type: 'boolean'
            },
            description: 'Get next sequence number instead of resources'
          }
        ],
        responses: {
          200: {
            description: 'Resources retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          oneOf: [
                            {
                              type: 'array',
                              items: { $ref: '#/components/schemas/Resource' }
                            },
                            { $ref: '#/components/schemas/NextSequenceResponse/properties/data' }
                          ]
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      },
      
      post: {
        tags: ['Resources'],
        summary: 'Create a new resource',
        description: 'Create a new catalog resource',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'header',
            name: 'x-tenant-id',
            required: true,
            schema: {
              type: 'string'
            },
            description: 'Tenant identifier'
          },
          {
            in: 'header',
            name: 'x-idempotency-key',
            required: false,
            schema: {
              type: 'string'
            },
            description: 'Idempotency key for safe retries'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateResourceRequest' }
            }
          }
        },
        responses: {
          201: {
            description: 'Resource created successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/Resource' }
                      }
                    }
                  ]
                }
              }
            }
          },
          400: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          409: {
            description: 'Resource already exists',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    
    '/api/resources/{id}': {
      get: {
        tags: ['Resources'],
        summary: 'Get resource by ID',
        description: 'Retrieve a specific resource by its ID',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid'
            },
            description: 'Resource ID'
          },
          {
            in: 'header',
            name: 'x-tenant-id',
            required: true,
            schema: {
              type: 'string'
            },
            description: 'Tenant identifier'
          }
        ],
        responses: {
          200: {
            description: 'Resource retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/Resource' }
                      }
                    }
                  ]
                }
              }
            }
          },
          404: {
            description: 'Resource not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      },
      
      patch: {
        tags: ['Resources'],
        summary: 'Update resource',
        description: 'Update an existing resource (partial updates supported)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid'
            },
            description: 'Resource ID'
          },
          {
            in: 'header',
            name: 'x-tenant-id',
            required: true,
            schema: {
              type: 'string'
            },
            description: 'Tenant identifier'
          },
          {
            in: 'header',
            name: 'x-idempotency-key',
            required: false,
            schema: {
              type: 'string'
            },
            description: 'Idempotency key for safe retries'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateResourceRequest' }
            }
          }
        },
        responses: {
          200: {
            description: 'Resource updated successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/Resource' }
                      }
                    }
                  ]
                }
              }
            }
          },
          400: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          404: {
            description: 'Resource not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          409: {
            description: 'Resource name conflict',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      },
      
      delete: {
        tags: ['Resources'],
        summary: 'Delete resource',
        description: 'Soft delete a resource (sets is_active to false)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid'
            },
            description: 'Resource ID'
          },
          {
            in: 'header',
            name: 'x-tenant-id',
            required: true,
            schema: {
              type: 'string'
            },
            description: 'Tenant identifier'
          },
          {
            in: 'header',
            name: 'x-idempotency-key',
            required: false,
            schema: {
              type: 'string'
            },
            description: 'Idempotency key for safe retries'
          }
        ],
        responses: {
          200: {
            description: 'Resource deleted successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiResponse' }
              }
            }
          },
          403: {
            description: 'Resource cannot be deleted',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          404: {
            description: 'Resource not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    
    '/api/resources/resource-types': {
      get: {
        tags: ['Resource Types'],
        summary: 'Get all resource types',
        description: 'Retrieve all available resource types',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'header',
            name: 'x-tenant-id',
            required: true,
            schema: {
              type: 'string'
            },
            description: 'Tenant identifier'
          }
        ],
        responses: {
          200: {
            description: 'Resource types retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/ResourceType' }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    }
  }
};

export default resourcesSwaggerDocs;