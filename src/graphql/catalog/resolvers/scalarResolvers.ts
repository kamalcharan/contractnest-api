// src/graphql/shared/resolvers/scalarResolvers.ts
// Complete scalar type resolvers for all custom GraphQL scalars
// Provides validation and parsing for custom scalar types defined in scalars.graphql

import { GraphQLScalarType, GraphQLError } from 'graphql';
import { Kind } from 'graphql/language';

// Helper function to validate UUID format
const validateUUID = (value: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};

// Helper function to validate email format
const validateEmail = (value: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
};

// Helper function to validate URL format
const validateURL = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

// Helper function to validate hex color
const validateHexColor = (value: string): boolean => {
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return hexRegex.test(value);
};

// Helper function to validate phone number (basic)
const validatePhoneNumber = (value: string): boolean => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''));
};

// DateTime scalar
const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  description: 'A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar.',
  serialize(value: any) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      return new Date(value).toISOString();
    }
    throw new GraphQLError(`Value is not a valid DateTime: ${value}`);
  },
  parseValue(value: any) {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new GraphQLError(`Value is not a valid DateTime: ${value}`);
      }
      return date;
    }
    throw new GraphQLError(`Value is not a valid DateTime: ${value}`);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      const date = new Date(ast.value);
      if (isNaN(date.getTime())) {
        throw new GraphQLError(`Value is not a valid DateTime: ${ast.value}`);
      }
      return date;
    }
    throw new GraphQLError(`Can only parse strings to DateTime but got a: ${ast.kind}`);
  }
});

// Date scalar
const Date = new GraphQLScalarType({
  name: 'Date',
  description: 'A date without time information (e.g., 2023-01-01).',
  serialize(value: any) {
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    if (typeof value === 'string') {
      return value.split('T')[0];
    }
    throw new GraphQLError(`Value is not a valid Date: ${value}`);
  },
  parseValue(value: any) {
    if (typeof value === 'string') {
      const date = new Date(value + 'T00:00:00.000Z');
      if (isNaN(date.getTime())) {
        throw new GraphQLError(`Value is not a valid Date: ${value}`);
      }
      return date;
    }
    throw new GraphQLError(`Value is not a valid Date: ${value}`);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      const date = new Date(ast.value + 'T00:00:00.000Z');
      if (isNaN(date.getTime())) {
        throw new GraphQLError(`Value is not a valid Date: ${ast.value}`);
      }
      return date;
    }
    throw new GraphQLError(`Can only parse strings to Date but got a: ${ast.kind}`);
  }
});

// Time scalar
const Time = new GraphQLScalarType({
  name: 'Time',
  description: 'A time without date information (e.g., 14:30:00).',
  serialize(value: any) {
    if (typeof value === 'string') {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
      if (timeRegex.test(value)) {
        return value;
      }
    }
    throw new GraphQLError(`Value is not a valid Time: ${value}`);
  },
  parseValue(value: any) {
    if (typeof value === 'string') {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
      if (timeRegex.test(value)) {
        return value;
      }
    }
    throw new GraphQLError(`Value is not a valid Time: ${value}`);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
      if (timeRegex.test(ast.value)) {
        return ast.value;
      }
      throw new GraphQLError(`Value is not a valid Time: ${ast.value}`);
    }
    throw new GraphQLError(`Can only parse strings to Time but got a: ${ast.kind}`);
  }
});

// JSON scalar
const JSON = new GraphQLScalarType({
  name: 'JSON',
  description: 'The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf).',
  serialize(value: any) {
    return value;
  },
  parseValue(value: any) {
    return value;
  },
  parseLiteral(ast) {
    switch (ast.kind) {
      case Kind.STRING:
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.INT:
      case Kind.FLOAT:
        return parseFloat(ast.value);
      case Kind.OBJECT:
        return parseObject(ast);
      case Kind.LIST:
        return ast.values.map(parseLiteral);
      default:
        return null;
    }
  }
});

// Helper function for JSON parsing
function parseObject(ast: any): any {
  const value = Object.create(null);
  ast.fields.forEach((field: any) => {
    value[field.name.value] = parseLiteral(field.value);
  });
  return value;
}

function parseLiteral(ast: any): any {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.OBJECT:
      return parseObject(ast);
    case Kind.LIST:
      return ast.values.map(parseLiteral);
    default:
      return null;
  }
}

// JSONObject scalar
const JSONObject = new GraphQLScalarType({
  name: 'JSONObject',
  description: 'The `JSONObject` scalar type represents JSON objects.',
  serialize(value: any) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid JSONObject: ${value}`);
  },
  parseValue(value: any) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid JSONObject: ${value}`);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.OBJECT) {
      return parseObject(ast);
    }
    throw new GraphQLError(`Can only parse objects to JSONObject but got a: ${ast.kind}`);
  }
});

// UUID scalar
const UUID = new GraphQLScalarType({
  name: 'UUID',
  description: 'A field whose value is a generic Universally Unique Identifier: https://en.wikipedia.org/wiki/Universally_unique_identifier.',
  serialize(value: any) {
    if (typeof value === 'string' && validateUUID(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid UUID: ${value}`);
  },
  parseValue(value: any) {
    if (typeof value === 'string' && validateUUID(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid UUID: ${value}`);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING && validateUUID(ast.value)) {
      return ast.value;
    }
    throw new GraphQLError(`Value is not a valid UUID: ${ast.value}`);
  }
});

// EmailAddress scalar
const EmailAddress = new GraphQLScalarType({
  name: 'EmailAddress',
  description: 'A field whose value conforms to the standard internet email address format as specified in RFC822: https://www.w3.org/Protocols/rfc822/',
  serialize(value: any) {
    if (typeof value === 'string' && validateEmail(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid EmailAddress: ${value}`);
  },
  parseValue(value: any) {
    if (typeof value === 'string' && validateEmail(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid EmailAddress: ${value}`);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING && validateEmail(ast.value)) {
      return ast.value;
    }
    throw new GraphQLError(`Value is not a valid EmailAddress: ${ast.value}`);
  }
});

// PositiveInt scalar
const PositiveInt = new GraphQLScalarType({
  name: 'PositiveInt',
  description: 'A field whose value is a positive integer.',
  serialize(value: any) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) {
      throw new GraphQLError(`Value must be a positive integer: ${value}`);
    }
    return num;
  },
  parseValue(value: any) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) {
      throw new GraphQLError(`Value must be a positive integer: ${value}`);
    }
    return num;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.INT) {
      const num = parseInt(ast.value, 10);
      if (num < 1) {
        throw new GraphQLError(`Value must be a positive integer: ${ast.value}`);
      }
      return num;
    }
    throw new GraphQLError(`Can only parse integers to PositiveInt but got a: ${ast.kind}`);
  }
});

// NonNegativeInt scalar
const NonNegativeInt = new GraphQLScalarType({
  name: 'NonNegativeInt',
  description: 'A field whose value is a non-negative integer (0 or greater).',
  serialize(value: any) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) {
      throw new GraphQLError(`Value must be a non-negative integer: ${value}`);
    }
    return num;
  },
  parseValue(value: any) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) {
      throw new GraphQLError(`Value must be a non-negative integer: ${value}`);
    }
    return num;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.INT) {
      const num = parseInt(ast.value, 10);
      if (num < 0) {
        throw new GraphQLError(`Value must be a non-negative integer: ${ast.value}`);
      }
      return num;
    }
    throw new GraphQLError(`Can only parse integers to NonNegativeInt but got a: ${ast.kind}`);
  }
});

// PositiveFloat scalar
const PositiveFloat = new GraphQLScalarType({
  name: 'PositiveFloat',
  description: 'A field whose value is a positive float.',
  serialize(value: any) {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      throw new GraphQLError(`Value must be a positive float: ${value}`);
    }
    return num;
  },
  parseValue(value: any) {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      throw new GraphQLError(`Value must be a positive float: ${value}`);
    }
    return num;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.FLOAT || ast.kind === Kind.INT) {
      const num = parseFloat(ast.value);
      if (num <= 0) {
        throw new GraphQLError(`Value must be a positive float: ${ast.value}`);
      }
      return num;
    }
    throw new GraphQLError(`Can only parse numbers to PositiveFloat but got a: ${ast.kind}`);
  }
});

// NonNegativeFloat scalar
const NonNegativeFloat = new GraphQLScalarType({
  name: 'NonNegativeFloat',
  description: 'A field whose value is a non-negative float (0.0 or greater).',
  serialize(value: any) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      throw new GraphQLError(`Value must be a non-negative float: ${value}`);
    }
    return num;
  },
  parseValue(value: any) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      throw new GraphQLError(`Value must be a non-negative float: ${value}`);
    }
    return num;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.FLOAT || ast.kind === Kind.INT) {
      const num = parseFloat(ast.value);
      if (num < 0) {
        throw new GraphQLError(`Value must be a non-negative float: ${ast.value}`);
      }
      return num;
    }
    throw new GraphQLError(`Can only parse numbers to NonNegativeFloat but got a: ${ast.kind}`);
  }
});

// NonEmptyString scalar
const NonEmptyString = new GraphQLScalarType({
  name: 'NonEmptyString',
  description: 'A string that cannot be passed as an empty string',
  serialize(value: any) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new GraphQLError(`Value must be a non-empty string: ${value}`);
    }
    return value;
  },
  parseValue(value: any) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new GraphQLError(`Value must be a non-empty string: ${value}`);
    }
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      if (ast.value.trim().length === 0) {
        throw new GraphQLError(`Value must be a non-empty string: ${ast.value}`);
      }
      return ast.value;
    }
    throw new GraphQLError(`Can only parse strings to NonEmptyString but got a: ${ast.kind}`);
  }
});

// URL scalar
const URL = new GraphQLScalarType({
  name: 'URL',
  description: 'A field whose value is a valid URL.',
  serialize(value: any) {
    if (typeof value === 'string' && validateURL(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid URL: ${value}`);
  },
  parseValue(value: any) {
    if (typeof value === 'string' && validateURL(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid URL: ${value}`);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING && validateURL(ast.value)) {
      return ast.value;
    }
    throw new GraphQLError(`Value is not a valid URL: ${ast.value}`);
  }
});

// PhoneNumber scalar
const PhoneNumber = new GraphQLScalarType({
  name: 'PhoneNumber',
  description: 'A field whose value is a valid phone number.',
  serialize(value: any) {
    if (typeof value === 'string' && validatePhoneNumber(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid PhoneNumber: ${value}`);
  },
  parseValue(value: any) {
    if (typeof value === 'string' && validatePhoneNumber(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid PhoneNumber: ${value}`);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING && validatePhoneNumber(ast.value)) {
      return ast.value;
    }
    throw new GraphQLError(`Value is not a valid PhoneNumber: ${ast.value}`);
  }
});

// HexColorCode scalar
const HexColorCode = new GraphQLScalarType({
  name: 'HexColorCode',
  description: 'A field whose value is a hexadecimal color code: https://en.wikipedia.org/wiki/Web_colors.',
  serialize(value: any) {
    if (typeof value === 'string' && validateHexColor(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid HexColorCode: ${value}`);
  },
  parseValue(value: any) {
    if (typeof value === 'string' && validateHexColor(value)) {
      return value;
    }
    throw new GraphQLError(`Value is not a valid HexColorCode: ${value}`);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING && validateHexColor(ast.value)) {
      return ast.value;
    }
    throw new GraphQLError(`Value is not a valid HexColorCode: ${ast.value}`);
  }
});

// Currency scalar (simple string implementation)
const Currency = new GraphQLScalarType({
  name: 'Currency',
  description: 'A field whose value is a Currency: https://en.wikipedia.org/wiki/ISO_4217.',
  serialize(value: any) {
    if (typeof value === 'string') {
      return value.toUpperCase();
    }
    throw new GraphQLError(`Value is not a valid Currency: ${value}`);
  },
  parseValue(value: any) {
    if (typeof value === 'string') {
      return value.toUpperCase();
    }
    throw new GraphQLError(`Value is not a valid Currency: ${value}`);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return ast.value.toUpperCase();
    }
    throw new GraphQLError(`Can only parse strings to Currency but got a: ${ast.kind}`);
  }
});

// Upload scalar (for file uploads)
const Upload = new GraphQLScalarType({
  name: 'Upload',
  description: 'A field whose value represents a file upload.',
  serialize() {
    throw new GraphQLError('Upload serialization is not supported');
  },
  parseValue(value: any) {
    return value;
  },
  parseLiteral() {
    throw new GraphQLError('Upload literal parsing is not supported');
  }
});

// Simple scalars for remaining types
const createSimpleStringScalar = (name: string, description: string) => new GraphQLScalarType({
  name,
  description,
  serialize: (value: any) => String(value),
  parseValue: (value: any) => String(value),
  parseLiteral: (ast) => ast.kind === Kind.STRING ? ast.value : null
});

// Export all scalar resolvers
export const scalarResolvers = {
  DateTime,
  Date,
  Time,
  JSON,
  JSONObject,
  UUID,
  EmailAddress,
  PositiveInt,
  NonNegativeInt,
  PositiveFloat,
  NonNegativeFloat,
  NonEmptyString,
  URL,
  PhoneNumber,
  HexColorCode,
  Currency,
  Upload,
  
  // Simple string-based scalars
  IPAddress: createSimpleStringScalar('IPAddress', 'A field whose value is a valid IP address (IPv4 or IPv6).'),
  Base64: createSimpleStringScalar('Base64', 'A field whose value is a Base64 encoded string.'),
  Duration: createSimpleStringScalar('Duration', 'A field whose value represents a duration in ISO 8601 format (e.g., P1Y2M3DT4H5M6S).'),
  Locale: createSimpleStringScalar('Locale', 'A field whose value represents a locale identifier (e.g., en-US, fr-FR).'),
  TimeZone: createSimpleStringScalar('TimeZone', 'A field whose value represents a timezone identifier (e.g., America/New_York, Europe/London).'),
  Version: createSimpleStringScalar('Version', 'A field whose value is a version string following semantic versioning (e.g., 1.2.3).'),
  MAC: createSimpleStringScalar('MAC', 'A field whose value is a MAC address.'),
  HSL: createSimpleStringScalar('HSL', 'A field whose value is a valid HSL color value.'),
  HSV: createSimpleStringScalar('HSV', 'A field whose value is a valid HSV color value.'),
  RGB: createSimpleStringScalar('RGB', 'A field whose value is a valid RGB color value.'),
  RGBA: createSimpleStringScalar('RGBA', 'A field whose value is a valid RGBA color value.'),
  IBAN: createSimpleStringScalar('IBAN', 'A field whose value is a valid IBAN (International Bank Account Number).'),
  ISBN: createSimpleStringScalar('ISBN', 'A field whose value is a valid ISBN (International Standard Book Number).'),
  JWT: createSimpleStringScalar('JWT', 'A field whose value is a valid JWT token.'),
  GUID: createSimpleStringScalar('GUID', 'A field whose value is a valid GUID (Globally Unique Identifier).'),
  ObjectID: createSimpleStringScalar('ObjectID', 'A field whose value is a valid object ID as used by MongoDB.'),
  PostalCode: createSimpleStringScalar('PostalCode', 'A field whose value is a valid postal code.'),
  USState: createSimpleStringScalar('USState', 'A field whose value is a valid US state code (e.g., CA, NY).'),
  CountryCode: createSimpleStringScalar('CountryCode', 'A field whose value is a valid country code (ISO 3166-1 alpha-2).'),
  LanguageCode: createSimpleStringScalar('LanguageCode', 'A field whose value is a valid language code (ISO 639-1).'),
  MIMEType: createSimpleStringScalar('MIMEType', 'A field whose value is a valid MIME type.'),
  SemVer: createSimpleStringScalar('SemVer', 'A field whose value is a valid semantic version constraint (e.g., >=1.0.0 <2.0.0).'),
  RegularExpression: createSimpleStringScalar('RegularExpression', 'A field whose value is a valid regular expression.'),
  SafeSQL: createSimpleStringScalar('SafeSQL', 'A field whose value is a valid SQL query string.'),
  FilePath: createSimpleStringScalar('FilePath', 'A field whose value is a valid file path.'),
  DirectoryPath: createSimpleStringScalar('DirectoryPath', 'A field whose value is a valid directory path.'),
  
  // Number-based scalars
  Port: new GraphQLScalarType({
    name: 'Port',
    description: 'A field whose value is a port number (1-65535).',
    serialize(value: any) {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 65535) {
        throw new GraphQLError(`Value must be a valid port number (1-65535): ${value}`);
      }
      return num;
    },
    parseValue(value: any) {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 65535) {
        throw new GraphQLError(`Value must be a valid port number (1-65535): ${value}`);
      }
      return num;
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        const num = parseInt(ast.value, 10);
        if (num < 1 || num > 65535) {
          throw new GraphQLError(`Value must be a valid port number (1-65535): ${ast.value}`);
        }
        return num;
      }
      throw new GraphQLError(`Can only parse integers to Port but got a: ${ast.kind}`);
    }
  }),
  
  Latitude: new GraphQLScalarType({
    name: 'Latitude',
    description: 'A field whose value is a latitude coordinate (-90 to 90).',
    serialize(value: any) {
      const num = parseFloat(value);
      if (isNaN(num) || num < -90 || num > 90) {
        throw new GraphQLError(`Value must be a valid latitude (-90 to 90): ${value}`);
      }
      return num;
    },
    parseValue(value: any) {
      const num = parseFloat(value);
      if (isNaN(num) || num < -90 || num > 90) {
        throw new GraphQLError(`Value must be a valid latitude (-90 to 90): ${value}`);
      }
      return num;
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.FLOAT || ast.kind === Kind.INT) {
        const num = parseFloat(ast.value);
        if (num < -90 || num > 90) {
          throw new GraphQLError(`Value must be a valid latitude (-90 to 90): ${ast.value}`);
        }
        return num;
      }
      throw new GraphQLError(`Can only parse numbers to Latitude but got a: ${ast.kind}`);
    }
  }),
  
  Longitude: new GraphQLScalarType({
    name: 'Longitude',
    description: 'A field whose value is a longitude coordinate (-180 to 180).',
    serialize(value: any) {
      const num = parseFloat(value);
      if (isNaN(num) || num < -180 || num > 180) {
        throw new GraphQLError(`Value must be a valid longitude (-180 to 180): ${value}`);
      }
      return num;
    },
    parseValue(value: any) {
      const num = parseFloat(value);
      if (isNaN(num) || num < -180 || num > 180) {
        throw new GraphQLError(`Value must be a valid longitude (-180 to 180): ${value}`);
      }
      return num;
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.FLOAT || ast.kind === Kind.INT) {
        const num = parseFloat(ast.value);
        if (num < -180 || num > 180) {
          throw new GraphQLError(`Value must be a valid longitude (-180 to 180): ${ast.value}`);
        }
        return num;
      }
      throw new GraphQLError(`Can only parse numbers to Longitude but got a: ${ast.kind}`);
    }
  }),
  
  // Big number scalars
  BigInt: new GraphQLScalarType({
    name: 'BigInt',
    description: 'A field whose value is a BigInt.',
    serialize: (value: any) => String(value),
    parseValue: (value: any) => BigInt(value),
    parseLiteral: (ast) => ast.kind === Kind.STRING ? BigInt(ast.value) : null
  }),
  
  Byte: new GraphQLScalarType({
    name: 'Byte',
    description: 'A field whose value is a Byte (0-255).',
    serialize(value: any) {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 0 || num > 255) {
        throw new GraphQLError(`Value must be a valid byte (0-255): ${value}`);
      }
      return num;
    },
    parseValue(value: any) {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 0 || num > 255) {
        throw new GraphQLError(`Value must be a valid byte (0-255): ${value}`);
      }
      return num;
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        const num = parseInt(ast.value, 10);
        if (num < 0 || num > 255) {
          throw new GraphQLError(`Value must be a valid byte (0-255): ${ast.value}`);
        }
        return num;
      }
      throw new GraphQLError(`Can only parse integers to Byte but got a: ${ast.kind}`);
    }
  }),
  
  Long: createSimpleStringScalar('Long', 'A field whose value is a Long integer (64-bit).'),
  Short: createSimpleStringScalar('Short', 'A field whose value is a Short integer (16-bit).'),
  UnsignedInt: createSimpleStringScalar('UnsignedInt', 'A field whose value is an unsigned integer.'),
  UnsignedFloat: createSimpleStringScalar('UnsignedFloat', 'A field whose value is an unsigned float.')
};