import { eventRegistryForControl } from "./useContracts";

export type ChainProduct = {
  productId: string;
  description: string;
};

export async function loadRegisteredProducts(): Promise<ChainProduct[]> {
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
    10,
    ...[...knownProducts.keys()].map((id) => Number(id) || 0),
  );
  const undiscoveredIds = Array.from(
    { length: highestKnownId },
    (_, index) => index + 1,
  ).filter((id) => !knownProducts.has(String(id)));

  // These product checks are independent. Query them concurrently instead of
  // waiting for each productExists/eventCount pair in sequence.
  const discoveredProducts = await Promise.all(
    undiscoveredIds.map(async (id) => {
      try {
        const exists = await registry.productExists(id);
        const hasEvents = !exists && (await registry.eventCount(id)) > 0n;
        return exists || hasEvents
          ? { productId: String(id), description: `Product ${id}` }
          : undefined;
      } catch {
        // Continue checking other product IDs if one chain read fails.
        return undefined;
      }
    }),
  );

  discoveredProducts.forEach((product) => {
    if (product) knownProducts.set(product.productId, product);
  });

  return [...knownProducts.values()].sort(
    (a, b) => Number(a.productId) - Number(b.productId),
  );
}
