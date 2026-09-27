import { eventRegistryForControl } from "./useContracts";

export type ChainProduct = {
  productId: string;
  description: string;
};

export async function loadChainProducts(): Promise<ChainProduct[]> {
  const registry = eventRegistryForControl();
  const knownProducts = new Map<string, ChainProduct>();

  try {
    const logs = await registry.queryFilter("ProductCreated", 0, "latest");
    logs.forEach((log) => {
      const parsed = "args" in log ? log.args : undefined;
      const productId = String(parsed?.productId ?? "");
      if (productId) {
        knownProducts.set(productId, {
          productId,
          description: String(parsed?.description ?? ""),
        });
      }
    });
  } catch {
    // Product discovery below does not depend on event log availability.
  }

  const highestKnownId = Math.max(
    100,
    ...[...knownProducts.keys()].map((id) => Number(id) || 0),
  );
  for (let id = 1; id <= highestKnownId; id += 1) {
    if (knownProducts.has(String(id))) continue;
    try {
      const exists = await registry.productExists(id);
      const hasEvents = !exists && (await registry.eventCount(id)) > 0n;
      if (exists || hasEvents) {
        knownProducts.set(String(id), {
          productId: String(id),
          description: `Product ${id}`,
        });
      }
    } catch {
      // Continue checking other product IDs if one chain read fails.
    }
  }

  return [...knownProducts.values()].sort(
    (a, b) => Number(a.productId) - Number(b.productId),
  );
}
