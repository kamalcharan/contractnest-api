// src/seeds/sampleContacts.seed.ts
// Industry-specific sample contacts seeded during onboarding.
// 3 contacts per industry: 1 corporate vendor, 1 individual professional,
// 1 contact_person (key person at the corporate).
//
// All are flagged is_seed=true, is_live=false so they can be identified
// and cleaned up / reseeded independently of real tenant data.

export interface SampleContactTemplate {
  type: 'corporate' | 'individual' | 'contact_person';
  company_name?: string;
  name?: string;
  salutation?: string;
  designation?: string;
  department?: string;
  notes?: string;
  // For contact_person: index of the corporate contact in this industry set
  corporateIndex?: number;
}

export const SAMPLE_CONTACTS_BY_INDUSTRY: Record<string, SampleContactTemplate[]> = {

  lifts_elevators: [
    {
      type: 'corporate',
      company_name: 'Kone Elevators India Pvt Ltd',
      designation: 'Elevator OEM & Service Vendor',
      notes: 'Sample vendor — replace with your actual elevator service partner',
    },
    {
      type: 'individual',
      salutation: 'Mr.',
      name: 'Arjun Mehta',
      designation: 'Lift Maintenance Technician',
      department: 'Field Service',
      notes: 'Sample technician — replace with your actual service engineer',
    },
    {
      type: 'contact_person',
      salutation: 'Ms.',
      name: 'Priya Sharma',
      designation: 'Key Account Manager',
      department: 'Sales & Service',
      corporateIndex: 0,
      notes: 'Sample account manager at vendor — replace with your actual contact',
    },
  ],

  hvac: [
    {
      type: 'corporate',
      company_name: 'Blue Star Limited',
      designation: 'HVAC OEM & Service Provider',
      notes: 'Sample HVAC vendor — replace with your actual service partner',
    },
    {
      type: 'individual',
      salutation: 'Mr.',
      name: 'Suresh Nair',
      designation: 'HVAC Systems Engineer',
      department: 'Technical Services',
      notes: 'Sample HVAC engineer — replace with your actual service contact',
    },
    {
      type: 'contact_person',
      salutation: 'Ms.',
      name: 'Deepa Krishnan',
      designation: 'Service Coordinator',
      department: 'Customer Support',
      corporateIndex: 0,
      notes: 'Sample coordinator at vendor — replace with your actual contact',
    },
  ],

  healthcare: [
    {
      type: 'corporate',
      company_name: 'Philips Healthcare India Pvt Ltd',
      designation: 'Medical Equipment Supplier',
      notes: 'Sample medical vendor — replace with your actual equipment supplier',
    },
    {
      type: 'individual',
      salutation: 'Dr.',
      name: 'Anil Verma',
      designation: 'Biomedical Equipment Specialist',
      department: 'Clinical Engineering',
      notes: 'Sample biomedical contact — replace with your actual specialist',
    },
    {
      type: 'contact_person',
      salutation: 'Ms.',
      name: 'Meera Pillai',
      designation: 'Procurement Lead',
      department: 'Procurement',
      corporateIndex: 0,
      notes: 'Sample procurement contact at vendor — replace with your actual contact',
    },
  ],

  facility_management: [
    {
      type: 'corporate',
      company_name: 'JLL India Pvt Ltd',
      designation: 'Integrated Facilities Management',
      notes: 'Sample FM vendor — replace with your actual facilities partner',
    },
    {
      type: 'individual',
      salutation: 'Mr.',
      name: 'Rahul Gupta',
      designation: 'Facilities Manager',
      department: 'Operations',
      notes: 'Sample FM contact — replace with your actual facilities manager',
    },
    {
      type: 'contact_person',
      salutation: 'Ms.',
      name: 'Sunita Rao',
      designation: 'Account Director',
      department: 'Client Services',
      corporateIndex: 0,
      notes: 'Sample account director at vendor — replace with your actual contact',
    },
  ],

  manufacturing: [
    {
      type: 'corporate',
      company_name: 'Bosch Rexroth India Pvt Ltd',
      designation: 'Industrial Equipment Supplier',
      notes: 'Sample industrial vendor — replace with your actual supplier',
    },
    {
      type: 'individual',
      salutation: 'Mr.',
      name: 'Vikram Singh',
      designation: 'Plant Maintenance Engineer',
      department: 'Maintenance',
      notes: 'Sample plant engineer — replace with your actual contact',
    },
    {
      type: 'contact_person',
      salutation: 'Ms.',
      name: 'Ananya Desai',
      designation: 'Technical Sales Manager',
      department: 'Sales',
      corporateIndex: 0,
      notes: 'Sample sales contact at vendor — replace with your actual contact',
    },
  ],

  real_estate: [
    {
      type: 'corporate',
      company_name: 'CBRE India Pvt Ltd',
      designation: 'Property & Asset Management',
      notes: 'Sample property manager — replace with your actual management company',
    },
    {
      type: 'individual',
      salutation: 'Ms.',
      name: 'Kavita Reddy',
      designation: 'Property Manager',
      department: 'Asset Management',
      notes: 'Sample property manager — replace with your actual contact',
    },
    {
      type: 'contact_person',
      salutation: 'Mr.',
      name: 'Rohan Joshi',
      designation: 'Asset Manager',
      department: 'Portfolio Management',
      corporateIndex: 0,
      notes: 'Sample asset manager at vendor — replace with your actual contact',
    },
  ],

  hospitality: [
    {
      type: 'corporate',
      company_name: 'Sodexo India Pvt Ltd',
      designation: 'Hospitality & Facility Services',
      notes: 'Sample hospitality vendor — replace with your actual services partner',
    },
    {
      type: 'individual',
      salutation: 'Mr.',
      name: 'Sanjay Patel',
      designation: 'Hotel Operations Manager',
      department: 'Operations',
      notes: 'Sample operations contact — replace with your actual manager',
    },
    {
      type: 'contact_person',
      salutation: 'Ms.',
      name: 'Nisha Kumar',
      designation: 'Procurement Head',
      department: 'Procurement',
      corporateIndex: 0,
      notes: 'Sample procurement contact at vendor — replace with your actual contact',
    },
  ],
};

// Falls back to facility_management contacts for unknown industries
export function getSampleContactsForIndustry(industryId: string): SampleContactTemplate[] {
  return SAMPLE_CONTACTS_BY_INDUSTRY[industryId] ?? SAMPLE_CONTACTS_BY_INDUSTRY['facility_management'];
}
