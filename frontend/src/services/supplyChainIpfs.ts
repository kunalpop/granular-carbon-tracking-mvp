export type SupplierRoleMap = Record<string, string>;
export type EmissionFactorStage = {
  stageId: number;
  name: string;
  actorRole: string;
  activityValue: number;
  activityUnit: string;
  emissionFactor_gCO2ePerUnit: number;
  efSource: string;
  methodology: string;
  notes?: string;
};
export type EmissionFactorLibrary = {
  libraryVersion: string;
  schemaVersion: string;
  productId: number;
  referenceProduct: string;
  stages: EmissionFactorStage[];
};

const cache = new Map<string, unknown>();

async function loadIpfsJson<T>(fileName: string): Promise<T> {
  if (cache.has(fileName)) return cache.get(fileName) as T;
  const response = await fetch(`/api/documents/by-name/${encodeURIComponent(fileName)}/plain`);
  if (!response.ok) throw new Error(`IPFS configuration ${fileName} is not available yet.`);
  const value = await response.json() as T;
  cache.set(fileName, value);
  return value;
}

export function loadSupplierRoleMap() {
  return loadIpfsJson<SupplierRoleMap>("role-participant-map.json");
}

export function loadEmissionFactors() {
  return loadIpfsJson<EmissionFactorLibrary>("emission-factors.json");
}

export function clearSupplyChainIpfsCache() {
  cache.clear();
}
