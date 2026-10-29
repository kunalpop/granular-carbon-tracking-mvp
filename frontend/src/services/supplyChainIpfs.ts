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

export type IpfsDocumentMetadata = {
  cid: string;
  originalFileName: string;
  createdAt: string;
  participantId: string;
  metadata?: { purpose?: string };
};

const cache = new Map<string, unknown>();
const persistentCachePrefix = "supply-chain-ipfs:";

async function loadIpfsJson<T>(fileName: string, cacheKey = fileName): Promise<T> {
  if (cache.has(cacheKey)) return cache.get(cacheKey) as T;
  try {
    const response = await fetch(`/api/documents/by-name/${encodeURIComponent(fileName)}/plain`);
    if (!response.ok) throw new Error(`IPFS configuration ${fileName} is not available yet.`);
    const value = await response.json() as T;
    cache.set(cacheKey, value);
    window.localStorage.setItem(`${persistentCachePrefix}${fileName}`, JSON.stringify(value));
    return value;
  } catch (error) {
    const stored = window.localStorage.getItem(`${persistentCachePrefix}${fileName}`);
    if (stored) {
      const value = JSON.parse(stored) as T;
      cache.set(cacheKey, value);
      return value;
    }
    throw error;
  }
}

async function loadIpfsJsonDirect<T>(fileName: string): Promise<T> {
  const response = await fetch(
    `/api/documents/by-name/${encodeURIComponent(fileName)}/plain?fresh=${Date.now()}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(`IPFS configuration ${fileName} is not available yet.`);
  return response.json() as Promise<T>;
}

export function loadSupplierRoleMap() {
  return loadIpfsJson<SupplierRoleMap>("role-participant-map.json");
}

export function loadEmissionFactors() {
  return loadIpfsJson<EmissionFactorLibrary>("emission-factors.json");
}

export function loadSupplierRoleMapDirect() {
  return loadIpfsJsonDirect<SupplierRoleMap>("role-participant-map.json");
}

export function loadEmissionFactorsDirect() {
  return loadIpfsJsonDirect<EmissionFactorLibrary>("emission-factors.json");
}

export async function loadIpfsDocumentMetadata(fileName: string) {
  const response = await fetch(
    `/api/documents/by-name/${encodeURIComponent(fileName)}?fresh=${Date.now()}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(`IPFS metadata ${fileName} is not available yet.`);
  return response.json() as Promise<IpfsDocumentMetadata>;
}

export function clearSupplyChainIpfsCache() {
  cache.clear();
}
