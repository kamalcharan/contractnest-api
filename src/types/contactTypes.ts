// Import from constants
import { 
  CONTACT_FORM_TYPES, 
  CONTACT_STATUS, 
  CONTACT_CLASSIFICATIONS,
  CONTACT_CHANNEL_TYPES,
  ADDRESS_TYPES 
} from '../utils/constants/contacts';

// Export type aliases
export type ContactType = typeof CONTACT_FORM_TYPES[keyof typeof CONTACT_FORM_TYPES];
export type ContactStatus = typeof CONTACT_STATUS[keyof typeof CONTACT_STATUS];
export type ContactClassification = typeof CONTACT_CLASSIFICATIONS[keyof typeof CONTACT_CLASSIFICATIONS];
export type ContactChannelType = typeof CONTACT_CHANNEL_TYPES[keyof typeof CONTACT_CHANNEL_TYPES];
export type AddressType = typeof ADDRESS_TYPES[keyof typeof ADDRESS_TYPES];

// Re-export the constants for convenience
export {
  CONTACT_FORM_TYPES,
  CONTACT_STATUS,
  CONTACT_CLASSIFICATIONS,
  CONTACT_CHANNEL_TYPES,
  ADDRESS_TYPES
};