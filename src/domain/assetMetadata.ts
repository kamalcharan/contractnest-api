/** Shared field contract for registry-backed Smart Forms. Sprint 1 defines the
 * vocabulary and safe resolution; execution wiring follows in Sprint 2. */
export type AssetKind = 'equipment' | 'asset';
export type AttributeType = 'text' | 'number' | 'boolean' | 'date' | 'select';
export type RequiredStage = 'none' | 'service_start' | 'form_submit';
export type FieldBinding =
  | { source: 'registry'; key: RegistryKey }
  | { source: 'specification'; key: string }
  | { source: 'service'; key: ServiceKey }
  | { source: 'response' };

export const registryKeys = ['id','name','code','serial_number','make','model','location','resource_type_id','asset_type_id','template_id','area_sqft','capacity'] as const;
export type RegistryKey = typeof registryKeys[number];
export const serviceKeys = ['contract_id','event_id','ticket_id','ticket_number','visit_number','scheduled_date','started_at','technician_id','technician_name'] as const;
export type ServiceKey = typeof serviceKeys[number];

export interface AttributeDefinition {
  resource_type_id: AssetKind;
  tenant_id: string | null;
  template_id: string | null;
  asset_type_id: string | null;
  attribute_key: string;
  label: string;
  data_type: AttributeType;
  unit: string | null;
  options: Array<{ value: string; label: string }>;
  required_stage: RequiredStage;
  is_active: boolean;
}

export interface AssetMetadata {
  id: string;
  tenant_id: string;
  resource_type_id: AssetKind;
  template_id: string | null;
  asset_type_id: string | null;
  updated_at: string | null;
  specifications: Record<string, unknown>;
  [key: string]: unknown;
}

const keyPattern = /^[a-z][a-z0-9_]{1,63}$/;
const isEmpty = (v: unknown) => v == null || typeof v === 'string' && v.trim() === '';
export function validateDefinition(d: AttributeDefinition): string[] {
  const errors: string[] = [];
  if (!['equipment','asset'].includes(d.resource_type_id)) errors.push('Invalid asset kind');
  if (d.template_id && d.asset_type_id) errors.push('Choose template or asset type, not both');
  if (d.asset_type_id && !d.tenant_id) errors.push('Asset type requires tenant scope');
  if (!keyPattern.test(d.attribute_key) || (registryKeys as readonly string[]).includes(d.attribute_key)) errors.push('Invalid or reserved attribute key');
  if (!d.label?.trim()) errors.push('Label required');
  if (!['text','number','boolean','date','select'].includes(d.data_type)) errors.push('Unsupported data type');
  if (d.unit && d.data_type !== 'number') errors.push('Units require a number');
  if (d.data_type === 'select' && !d.options?.length || d.data_type !== 'select' && !!d.options?.length) errors.push('Select options do not match data type');
  if (!['none','service_start','form_submit'].includes(d.required_stage)) errors.push('Invalid required stage');
  return errors;
}

export function applicableDefinitions(defs: AttributeDefinition[], asset: AssetMetadata): AttributeDefinition[] {
  const kind = defs.filter(d => d.is_active && d.resource_type_id === asset.resource_type_id
    && (d.tenant_id === null || d.tenant_id === asset.tenant_id)
    && (d.template_id === null || d.template_id === asset.template_id)
    && (d.asset_type_id === null || d.asset_type_id === asset.asset_type_id));
  const byKey = new Map<string, AttributeDefinition>();
  const specificity = (d: AttributeDefinition) => (d.asset_type_id ? 4 : d.template_id ? 2 : 0) + (d.tenant_id ? 1 : 0);
  for (const d of kind.sort((a,b) => specificity(a)-specificity(b))) byKey.set(d.attribute_key,d);
  return [...byKey.values()];
}

export function validateBinding(binding: FieldBinding, defs: AttributeDefinition[]): string | null {
  if (binding.source === 'response') return null;
  if (binding.source === 'registry') return (registryKeys as readonly string[]).includes(binding.key) ? null : 'Unknown registry key';
  if (binding.source === 'service') return (serviceKeys as readonly string[]).includes(binding.key) ? null : 'Unknown service key';
  if (binding.source === 'specification') return defs.some(d => d.is_active && d.attribute_key === binding.key) ? null : 'Unknown specification key';
  return 'Unknown binding source';
}

export function resolveBinding(binding: FieldBinding, asset: AssetMetadata, service: Record<string, unknown>): unknown {
  switch (binding.source) {
    case 'registry': return asset[binding.key] ?? null;
    case 'specification': return asset.specifications?.[binding.key] ?? null;
    case 'service': return service[binding.key] ?? null;
    case 'response': return null;
  }
}

export function missingAtStage(defs: AttributeDefinition[], asset: AssetMetadata, stage: Exclude<RequiredStage,'none'>): AttributeDefinition[] {
  return applicableDefinitions(defs,asset).filter(d => d.required_stage === stage && isEmpty(asset.specifications?.[d.attribute_key]));
}

export function assetSnapshot(asset: AssetMetadata, defs: AttributeDefinition[]) {
  const keys = applicableDefinitions(defs,asset).map(d => d.attribute_key);
  const core: Record<string, unknown> = {};
  for (const key of registryKeys) if (!['id','template_id','resource_type_id'].includes(key)) core[key] = asset[key] ?? null;
  const specifications: Record<string, unknown> = {};
  for (const key of keys) specifications[key] = asset.specifications?.[key] ?? null;
  return {
    id: asset.id, resource_type_id: asset.resource_type_id, template_id: asset.template_id, asset_type_id: asset.asset_type_id,
    registry_updated_at: asset.updated_at,
    ...core, specifications,
  };
}
