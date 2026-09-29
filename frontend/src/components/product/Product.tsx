import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
import { getSelectedRole, getSigner } from "../../services/getSigner";
import { registerProduct, type RegisteredProduct } from "./registerProduct";
import { eventRegistryForControl } from "../../services/useContracts";
import { loadRegisteredProducts } from "../../services/getRegisteredProducts";

const PRODUCT_REVIEW_KEY = "product-review-status-v2";
const PRODUCT_REVIEW_DATA_KEY = "product-review-data-v2";
type ReviewStatus = "draft" | "sent" | "confirmed";

type ReviewData = {
  status: ReviewStatus;
  deployerDescription: string;
  oemDescription: string;
};

const defaultDescription = (productNumber = EMISSION_FACTORS.productId) =>
  `Laptop unit CMVP-${String(productNumber).padStart(3, "0")} (${EMISSION_FACTORS.referenceProduct})`;

function loadReviewData(): ReviewData {
  const fallback = defaultDescription();
  if (typeof window === "undefined") {
    return { status: "draft", deployerDescription: fallback, oemDescription: fallback };
  }

  try {
    const saved = JSON.parse(
      window.localStorage.getItem(PRODUCT_REVIEW_DATA_KEY) ?? "null",
    ) as Partial<ReviewData> | null;
    const status = saved?.status ??
      (window.localStorage.getItem(PRODUCT_REVIEW_KEY) as ReviewStatus | null) ??
      "draft";
    const deployerDescription = saved?.deployerDescription ?? fallback;
    return {
      status,
      deployerDescription,
      oemDescription: saved?.oemDescription ?? deployerDescription,
    };
  } catch {
    return { status: "draft", deployerDescription: fallback, oemDescription: fallback };
  }
}

function saveReviewData(data: ReviewData) {
  window.localStorage.setItem(PRODUCT_REVIEW_KEY, data.status);
  window.localStorage.setItem(PRODUCT_REVIEW_DATA_KEY, JSON.stringify(data));
}

export default function Product() {
  const [product, setProduct] = useState<RegisteredProduct | undefined>();
  const [nextProductNumber, setNextProductNumber] = useState(EMISSION_FACTORS.productId);
  const [isWorking, setIsWorking] = useState(false);
  const [review, setReview] = useState<ReviewData>(loadReviewData);
  const [error, setError] = useState<string>();
  const [selectedRole, setSelectedRole] = useState(() => getSelectedRole());
  const [oemAddress] = useState(() => getSigner("oem").address);
  const isDeployer = selectedRole === "deployer";
  const isOem = selectedRole === "oem";

  useEffect(() => {
    const updateRole = () => setSelectedRole(getSelectedRole());
    window.addEventListener("control-account-change", updateRole);
    return () => window.removeEventListener("control-account-change", updateRole);
  }, []);

  useEffect(() => {
    const refreshNextProductNumber = async () => {
      if ((window.localStorage.getItem("selected-product-id") ?? "new") !== "new") return;
      try {
        const registeredProducts = await loadRegisteredProducts();
        const nextNumber = registeredProducts.length + 1;
        setNextProductNumber(nextNumber);
        setReview((current) => {
          if (current.status !== "draft") return current;
          const next = {
            ...current,
            deployerDescription: defaultDescription(nextNumber),
            oemDescription: defaultDescription(nextNumber),
          };
          saveReviewData(next);
          return next;
        });
      } catch {
        // Keep the configured default while the chain is unavailable.
      }
    };
    const refreshForSelection = () => void refreshNextProductNumber();
    void refreshNextProductNumber();
    window.addEventListener("product-selection-change", refreshForSelection);
    window.addEventListener("product-registration-change", refreshForSelection);
    return () => {
      window.removeEventListener("product-selection-change", refreshForSelection);
      window.removeEventListener("product-registration-change", refreshForSelection);
    };
  }, []);

  useEffect(() => {
    const restoreRegisteredProduct = async () => {
      try {
        const selectedId = window.localStorage.getItem("selected-product-id") ?? "new";
        if (selectedId === "new") {
          setProduct(undefined);
          return;
        }

        const registry = eventRegistryForControl() as typeof eventRegistryForControl extends () => infer T ? T & {
          getProduct(productId: bigint): Promise<{
            description: string;
            exists: boolean;
          }>;
        } : never;
        const chainProduct = await registry.getProduct(BigInt(selectedId));
        setProduct(chainProduct.exists ? {
          productId: BigInt(selectedId),
          description: String(chainProduct.description),
          oemAddress,
        } : undefined);
      } catch {
        // The review form remains usable while the chain is unavailable.
      }
    };
    const refreshProduct = () => void restoreRegisteredProduct();
    void restoreRegisteredProduct();
    window.addEventListener("product-selection-change", refreshProduct);
    window.addEventListener("product-registration-change", refreshProduct);
    return () => {
      window.removeEventListener("product-selection-change", refreshProduct);
      window.removeEventListener("product-registration-change", refreshProduct);
    };
  }, [oemAddress]);

  const updateReview = (changes: Partial<ReviewData>) => {
    setReview((current) => {
      const next = { ...current, ...changes };
      saveReviewData(next);
      return next;
    });
  };

  const handleProductAction = async () => {
    if (isWorking || product) return;
    setIsWorking(true);
    setError(undefined);

    try {
      if (isDeployer && review.status === "draft") {
        if (!review.deployerDescription.trim()) throw new Error("Product description is required.");
        updateReview({
          status: "sent",
          oemDescription: review.deployerDescription,
        });
        return;
      }

      if (isOem && review.status === "sent") {
        if (!review.oemDescription.trim()) throw new Error("Product description is required.");
        updateReview({ status: "confirmed" });
        return;
      }

      if (isDeployer && review.status === "confirmed") {
        const registeredProduct = await registerProduct(review.oemDescription, oemAddress);
        setProduct(registeredProduct);
        window.localStorage.removeItem(PRODUCT_REVIEW_KEY);
        window.localStorage.removeItem(PRODUCT_REVIEW_DATA_KEY);
        window.localStorage.setItem(
          "selected-product-id",
          registeredProduct.productId.toString(),
        );
        window.dispatchEvent(new Event("product-registration-change"));
        window.dispatchEvent(new Event("product-selection-change"));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Product action failed.");
    } finally {
      setIsWorking(false);
    }
  };

  const canViewProduct = isDeployer || Boolean(product) || (isOem && review.status !== "draft");
  const selectedProductId = window.localStorage.getItem("selected-product-id") ?? "new";
  const productLabel = product
    ? `CMVP-${String(product.productId).padStart(3, "0")}`
    : selectedProductId === "new"
      ? `CMVP-${String(nextProductNumber).padStart(3, "0")}`
      : `CMVP-${String(EMISSION_FACTORS.productId).padStart(3, "0")}`;
  const description = product?.description ??
    (review.status === "confirmed" || (isOem && review.status === "sent")
      ? review.oemDescription
      : review.deployerDescription);
  const canEditDescription = !product && (
    (isDeployer && review.status === "draft") ||
    (isOem && review.status === "sent")
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">Product Genesis</div>
          <h1>Register Product</h1>
        </div>
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
                    onChange={(event) => updateReview(
                      isOem
                        ? { oemDescription: event.target.value }
                        : { deployerDescription: event.target.value },
                    )}
                    disabled={!canEditDescription || isWorking}
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
          <div className={`product-status ${product ? "minted" : "ready-to-register"}`}>
            <span className={product ? "live-dot ready" : "live-dot"} />
            <strong>{product ? "Product Registered" : "Product Verification"}</strong>
          </div>
          <div className="metric">{productLabel}</div>
          <p>
            {product
              ? "Product details are frozen and the passport is minted."
              : review.status === "draft"
                ? isDeployer ? "Send to OEM for review." : "Awaiting deployer submission."
                : review.status === "sent"
                  ? isOem ? "Edit the description and send confirmation to the deployer." : "Awaiting OEM verification."
                  : isDeployer ? "OEM confirmed the details. Mint the product on its behalf." : "Details confirmed; awaiting deployer minting."}
          </p>
          {(isDeployer || isOem) && !product && (
            <div className="action-row">
              <Button
                onClick={handleProductAction}
                disabled={isWorking ||
                  (isDeployer && review.status === "sent") ||
                  (isOem && review.status !== "sent")}
              >
                {isWorking
                  ? isDeployer && review.status === "confirmed" ? "Minting..." : "Sending..."
                  : isDeployer
                    ? review.status === "draft"
                      ? "Send to OEM"
                      : review.status === "confirmed"
                        ? "Mint Product"
                        : "Awaiting OEM confirmation"
                    : review.status === "sent"
                      ? "Confirm to Deployer"
                      : "Confirmed"}
              </Button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </>
  );
}
