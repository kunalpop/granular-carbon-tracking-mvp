import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
import { getSelectedRole, getSigner } from "../../services/getSigner";
import {
  isProductRegistered,
  registerProduct,
  type RegisteredProduct,
} from "./registerProduct";

const PRODUCT_CACHE_KEY = "registered-product-cache";

function loadCachedProduct(): RegisteredProduct | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const cached = window.localStorage.getItem(PRODUCT_CACHE_KEY);
    if (!cached) return undefined;

    const saved = JSON.parse(cached) as {
      productId: string;
      description: string;
      oemAddress: string;
    };
    return {
      productId: BigInt(saved.productId),
      description: saved.description,
      oemAddress: saved.oemAddress,
    };
  } catch {
    return undefined;
  }
}

export default function Product() {
  const [product, setProduct] = useState<RegisteredProduct | undefined>(() =>
    loadCachedProduct(),
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedRole, setSelectedRole] = useState(() => getSelectedRole());
  const isDeployer = selectedRole === "deployer";
  const [description, setDescription] = useState(() =>
    `Laptop unit CMVP-${String(EMISSION_FACTORS.productId).padStart(3, "0")} (${EMISSION_FACTORS.referenceProduct})`,
  );
  const [oemAddress] = useState(() => getSigner("oem").address);

  useEffect(() => {
    const updateRole = () => setSelectedRole(getSelectedRole());
    window.addEventListener("control-account-change", updateRole);
    return () => window.removeEventListener("control-account-change", updateRole);
  }, []);

  useEffect(() => {
    const restoreRegisteredProduct = async () => {
      const cached = window.localStorage.getItem(PRODUCT_CACHE_KEY);
      if (!cached) return;

      try {
        const saved = JSON.parse(cached) as {
          productId: string;
          description: string;
          oemAddress: string;
        };
        const productId = BigInt(saved.productId);

        if (await isProductRegistered(productId)) {
          setProduct({
            productId,
            description: saved.description,
            oemAddress: saved.oemAddress,
          });
        } else {
          window.localStorage.removeItem(PRODUCT_CACHE_KEY);
          setProduct(undefined);
        }
      } catch {
        window.localStorage.removeItem(PRODUCT_CACHE_KEY);
        setProduct(undefined);
      }
    };

    void restoreRegisteredProduct();
  }, []);

  const handleRegisterProduct = async () => {
    if (!isDeployer || isRegistering || product) return;
    setIsRegistering(true);
    setError(undefined);
    try {
      const registeredProduct = await registerProduct(description, oemAddress);
      setProduct(registeredProduct);
      window.localStorage.setItem(
        PRODUCT_CACHE_KEY,
        JSON.stringify({
          productId: registeredProduct.productId.toString(),
          description: registeredProduct.description,
          oemAddress: registeredProduct.oemAddress,
        }),
      );
      window.dispatchEvent(new Event("product-registration-change"));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Product registration failed.",
      );
    } finally {
      setIsRegistering(false);
    }
  };

  const canViewProduct = isDeployer || Boolean(product);

  const productLabel = product
    ? `CMVP-${String(product.productId).padStart(3, "0")}`
    : `CMVP-${String(EMISSION_FACTORS.productId).padStart(3, "0")}`;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">Product Genesis</div>
          <h1>Register Product On Chain</h1>
        </div>
        <p>
          Register the reference product on chain before starting its lifecycle
          simulation.
        </p>
      </div>
      <div className="section-grid">
        <section className="panel wide">
          {canViewProduct ? (
            <>
              <div className="data-row">
                <span>Product Description</span>
                {product ? (
                  <span>{product.description}</span>
                ) : (
                  <input
                    className="product-description-input"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={!isDeployer || isRegistering}
                  />
                )}
              </div>
              <div className="data-row">
                <span>Product ID</span>
                <span className="mono">{productLabel}</span>
              </div>
              <div className="data-row">
                <span>Configuration</span>
                <span className="mono">v{EMISSION_FACTORS.libraryVersion}</span>
              </div>
            </>
          ) : (
            <p>Product details will be available after registration.</p>
          )}
        </section>
        <section className="panel narrow">
          <div
            className={`product-status ${
              product ? "minted" : "ready-to-register"
            }`}
          >
            <span className={product ? "live-dot ready" : "live-dot"} />
            <strong>
              {product ? "Product Registered" : "Ready to Register"}
            </strong>
          </div>
          <div className="metric">{productLabel}</div>
          <p>
            {product
              ? "Product created for the current lifecycle input."
              : "Product configured for the current lifecycle input."}
          </p>
          {isDeployer && (
          <div className="action-row">
            <Button
              onClick={handleRegisterProduct}
              disabled={!isDeployer || isRegistering || Boolean(product)}
            >
              {isRegistering
                ? "Registering…"
                : product
                ? "Product Minted"
                : "Create Product"}
            </Button>
          </div>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </>
  );
}
