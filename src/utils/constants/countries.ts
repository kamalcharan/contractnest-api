// src/utils/constants/countries.ts
// Country phone length data for server-side validation

interface CountryPhoneConfig {
  code: string;
  phoneCode: string;
  phoneLength: number | [number, number]; // Single number or [min, max]
}

// Simplified country list with phone validation data
export const COUNTRY_PHONE_CONFIG: CountryPhoneConfig[] = [
  { code: 'IN', phoneCode: '91', phoneLength: 10 },
  { code: 'US', phoneCode: '1', phoneLength: 10 },
  { code: 'GB', phoneCode: '44', phoneLength: [10, 11] },
  { code: 'CA', phoneCode: '1', phoneLength: 10 },
  { code: 'AU', phoneCode: '61', phoneLength: 9 },
  { code: 'AE', phoneCode: '971', phoneLength: 9 },
  { code: 'SG', phoneCode: '65', phoneLength: 8 },
  { code: 'MY', phoneCode: '60', phoneLength: [9, 10] },
  { code: 'CN', phoneCode: '86', phoneLength: 11 },
  { code: 'JP', phoneCode: '81', phoneLength: 10 },
  { code: 'KR', phoneCode: '82', phoneLength: [9, 10] },
  { code: 'DE', phoneCode: '49', phoneLength: [10, 11] },
  { code: 'FR', phoneCode: '33', phoneLength: 9 },
  { code: 'IT', phoneCode: '39', phoneLength: 10 },
  { code: 'ES', phoneCode: '34', phoneLength: 9 },
  { code: 'NL', phoneCode: '31', phoneLength: 9 },
  { code: 'BE', phoneCode: '32', phoneLength: 9 },
  { code: 'CH', phoneCode: '41', phoneLength: 9 },
  { code: 'AT', phoneCode: '43', phoneLength: [10, 11] },
  { code: 'PL', phoneCode: '48', phoneLength: 9 },
  { code: 'SE', phoneCode: '46', phoneLength: [9, 10] },
  { code: 'NO', phoneCode: '47', phoneLength: 8 },
  { code: 'DK', phoneCode: '45', phoneLength: 8 },
  { code: 'FI', phoneCode: '358', phoneLength: [9, 10] },
  { code: 'IE', phoneCode: '353', phoneLength: 9 },
  { code: 'PT', phoneCode: '351', phoneLength: 9 },
  { code: 'GR', phoneCode: '30', phoneLength: 10 },
  { code: 'RU', phoneCode: '7', phoneLength: 10 },
  { code: 'BR', phoneCode: '55', phoneLength: [10, 11] },
  { code: 'MX', phoneCode: '52', phoneLength: 10 },
  { code: 'AR', phoneCode: '54', phoneLength: 10 },
  { code: 'CL', phoneCode: '56', phoneLength: 9 },
  { code: 'CO', phoneCode: '57', phoneLength: 10 },
  { code: 'ZA', phoneCode: '27', phoneLength: 9 },
  { code: 'NG', phoneCode: '234', phoneLength: 10 },
  { code: 'EG', phoneCode: '20', phoneLength: 10 },
  { code: 'KE', phoneCode: '254', phoneLength: 9 },
  { code: 'SA', phoneCode: '966', phoneLength: 9 },
  { code: 'IL', phoneCode: '972', phoneLength: 9 },
  { code: 'TR', phoneCode: '90', phoneLength: 10 },
  { code: 'PK', phoneCode: '92', phoneLength: 10 },
  { code: 'BD', phoneCode: '880', phoneLength: 10 },
  { code: 'ID', phoneCode: '62', phoneLength: [10, 12] },
  { code: 'TH', phoneCode: '66', phoneLength: 9 },
  { code: 'VN', phoneCode: '84', phoneLength: 10 },
  { code: 'PH', phoneCode: '63', phoneLength: 10 },
  { code: 'NZ', phoneCode: '64', phoneLength: [8, 10] },
  { code: 'HK', phoneCode: '852', phoneLength: 8 },
  { code: 'TW', phoneCode: '886', phoneLength: 9 },
  { code: 'NP', phoneCode: '977', phoneLength: 10 },
  { code: 'LK', phoneCode: '94', phoneLength: 9 },
];

/**
 * Get phone length requirements for a country
 */
export const getPhoneLengthForCountry = (countryCode: string): { min: number; max: number } => {
  const country = COUNTRY_PHONE_CONFIG.find(c => c.code === countryCode);
  if (!country) {
    // Default fallback for unknown countries
    return { min: 7, max: 15 };
  }

  if (Array.isArray(country.phoneLength)) {
    return { min: country.phoneLength[0], max: country.phoneLength[1] };
  }
  return { min: country.phoneLength, max: country.phoneLength };
};

/**
 * Get country by phone code
 */
export const getCountryByPhoneCode = (phoneCode: string): CountryPhoneConfig | undefined => {
  return COUNTRY_PHONE_CONFIG.find(c => c.phoneCode === phoneCode);
};

/**
 * Validate phone number length for a country
 */
export const validatePhoneLengthForCountry = (
  phoneDigits: string,
  countryCode: string
): { isValid: boolean; error?: string } => {
  const digitsOnly = phoneDigits.replace(/\D/g, '');
  const { min, max } = getPhoneLengthForCountry(countryCode);

  if (digitsOnly.length < min) {
    const lengthDesc = min === max ? `exactly ${min}` : `at least ${min}`;
    return {
      isValid: false,
      error: `Phone number must be ${lengthDesc} digits for this country`
    };
  }

  if (digitsOnly.length > max) {
    const lengthDesc = min === max ? `exactly ${max}` : `at most ${max}`;
    return {
      isValid: false,
      error: `Phone number must be ${lengthDesc} digits for this country`
    };
  }

  return { isValid: true };
};

// Name validation patterns
export const NAME_PATTERN = /^[\p{L}\p{M}\s\-'.]+$/u;
export const COMPANY_NAME_PATTERN = /^[\p{L}\p{M}\p{N}\s\-'.&,()]+$/u;

/**
 * Validate individual name
 */
export const validateIndividualName = (name: string): { isValid: boolean; error?: string } => {
  const trimmed = name.trim();

  if (!trimmed) {
    return { isValid: false, error: 'Name is required' };
  }

  if (trimmed.length < 2) {
    return { isValid: false, error: 'Name must be at least 2 characters' };
  }

  if (trimmed.length > 100) {
    return { isValid: false, error: 'Name must not exceed 100 characters' };
  }

  if (!NAME_PATTERN.test(trimmed)) {
    return {
      isValid: false,
      error: 'Name can only contain letters, spaces, hyphens, apostrophes, and periods'
    };
  }

  // Check for consecutive special characters
  if (/[\-'.]{2,}/.test(trimmed)) {
    return { isValid: false, error: 'Name cannot have consecutive special characters' };
  }

  return { isValid: true };
};

/**
 * Validate company name
 */
export const validateCompanyName = (name: string): { isValid: boolean; error?: string } => {
  const trimmed = name.trim();

  if (!trimmed) {
    return { isValid: false, error: 'Company name is required' };
  }

  if (trimmed.length < 2) {
    return { isValid: false, error: 'Company name must be at least 2 characters' };
  }

  if (trimmed.length > 100) {
    return { isValid: false, error: 'Company name must not exceed 100 characters' };
  }

  if (!COMPANY_NAME_PATTERN.test(trimmed)) {
    return {
      isValid: false,
      error: 'Company name contains invalid characters'
    };
  }

  return { isValid: true };
};
