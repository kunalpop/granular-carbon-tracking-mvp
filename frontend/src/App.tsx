import { useEffect, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import Participants from "./components/participants/Participants";
import Product from "./components/product/Product";
import Simulation from "./components/events/Events";
import Results from "./components/results/Results";
import Governance from "./components/governance/Governance";
import Voting from "./components/governance/Voting";
import Audit from "./components/audit/Audit";
import AccountControl from "./components/audit/AccountControl";
import { areActorsRegistered } from "./components/participants/registerParticipants";
import { isProductRegistered } from "./components/product/registerProduct";
import { NETWORK_CONFIG } from "./services/networkConfig";
import { getSelectedRole, type AccountRole } from "./services/getSigner";
import {
  loadRegisteredProducts,
  type ChainProduct,
} from "./services/getRegisteredProducts";
import { eventRegistryForControl } from "./services/controlContracts";
import "./App.css";

const SIMULATION_EVENT_COUNT = 10;
const STUDIES_COMPLETE_CACHE_KEY = "evaluation-studies-complete";
const SELECTED_PRODUCT_KEY = "selected-product-id";

type WorkflowTabProps = {
  to: string;
  number: string;
  label: string;
  enabled: boolean;
};

function WorkflowTab({ to, number, label, enabled }: WorkflowTabProps) {
  if (!enabled) {
    return (
      <span className="nav-item nav-item-disabled" aria-disabled="true">
        <span className="nav-number">{number}</span>
        {label}
      </span>
    );
  }

  return (
    <NavLink to={to} className="nav-item">
      <span className="nav-number">{number}</span>
      {label}
    </NavLink>
  );
}

export default function App() {
  const [participantsReady, setParticipantsReady] = useState(false);
  const [productReady, setProductReady] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [studiesComplete, setStudiesComplete] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STUDIES_COMPLETE_CACHE_KEY) === "true";
  });
  const simulationReady = participantsReady && productReady;
  const [networkOnline, setNetworkOnline] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AccountRole>(() =>
    getSelectedRole(),
  );
  const [products, setProducts] = useState<ChainProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(
    () => window.localStorage.getItem(SELECTED_PRODUCT_KEY) ?? "new",
  );
  const navigate = useNavigate();
  const canUseAudit = selectedRole === "auditor";
  const canUseEscalations = selectedRole !== "deployer";
  const isParticipant =
    selectedRole !== "deployer" && selectedRole !== "auditor";
  const canUseGovernance = selectedRole === "deployer";
  const canUseVoting = true;
  const networkLabel = NETWORK_CONFIG.url.includes("8545") ? "BESU" : "CHAIN";

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setProducts(await loadRegisteredProducts());
      } catch {
        setProducts([]);
      }
    };
    void loadProducts();
    const refreshProducts = () => void loadProducts();
    const refreshSelection = () => {
      const productId =
        window.localStorage.getItem(SELECTED_PRODUCT_KEY) ?? "new";
      setSelectedProductId(productId);
      if (productId === "new") {
        setProductReady(false);
        return;
      }
      void isProductRegistered(BigInt(productId))
        .then(setProductReady)
        .catch(() => setProductReady(false));
    };
    window.addEventListener("product-registration-change", refreshProducts);
    window.addEventListener("product-selection-change", refreshSelection);
    return () => {
      window.removeEventListener(
        "product-registration-change",
        refreshProducts,
      );
      window.removeEventListener("product-selection-change", refreshSelection);
    };
  }, []);

  useEffect(() => {
    const updateRole = () => setSelectedRole(getSelectedRole());
    window.addEventListener("control-account-change", updateRole);
    return () =>
      window.removeEventListener("control-account-change", updateRole);
  }, []);

  useEffect(() => {
    async function checkNetwork() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(NETWORK_CONFIG.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_chainId",
            params: [],
            id: 1,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const { result } = await res.json();
        setNetworkOnline(Boolean(result));
      } catch {
        setNetworkOnline(false);
      }
    }
    checkNetwork();
    const interval = setInterval(checkNetwork, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const syncStatus = async () => {
      if (typeof window === "undefined") {
        setParticipantsReady(false);
        return;
      }

      try {
        setParticipantsReady(await areActorsRegistered());
      } catch {
        setParticipantsReady(false);
      }
      try {
        const selectedId =
          window.localStorage.getItem(SELECTED_PRODUCT_KEY) ?? "new";
        setProductReady(
          selectedId !== "new" &&
            (await isProductRegistered(BigInt(selectedId))),
        );
      } catch {
        setProductReady(false);
      }
      try {
        const selectedId =
          window.localStorage.getItem(SELECTED_PRODUCT_KEY) ?? "new";
        if (selectedId === "new") {
          setSimulationComplete(false);
        } else {
          const registry = eventRegistryForControl();
          const count = await registry.eventCount(BigInt(selectedId));
          setSimulationComplete(Number(count) >= SIMULATION_EVENT_COUNT);
        }
      } catch {
        setSimulationComplete(false);
      }
      setStudiesComplete(
        window.localStorage.getItem(STUDIES_COMPLETE_CACHE_KEY) === "true",
      );
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STUDIES_COMPLETE_CACHE_KEY) {
        void syncStatus();
      }
    };

    const handleRegistrationChange = () => void syncStatus();
    window.addEventListener(
      "simulation-registration-change",
      handleRegistrationChange,
    );

    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      "actors-registration-change",
      handleRegistrationChange,
    );
    window.addEventListener(
      "product-registration-change",
      handleRegistrationChange,
    );
    window.addEventListener(
      "product-selection-change",
      handleRegistrationChange,
    );
    window.addEventListener(
      "simulation-registration-change",
      handleRegistrationChange,
    );
    window.addEventListener("studies-complete", handleRegistrationChange);

    void syncStatus();

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        "actors-registration-change",
        handleRegistrationChange,
      );
      window.removeEventListener(
        "product-registration-change",
        handleRegistrationChange,
      );
      window.removeEventListener(
        "product-selection-change",
        handleRegistrationChange,
      );
      window.removeEventListener(
        "simulation-registration-change",
        handleRegistrationChange,
      );
      window.removeEventListener("studies-complete", handleRegistrationChange);
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/participants" className="brand">
          <span className="brand-mark">GC</span>
          <span>
            <strong>Granular Carbon</strong>
            <small>tracking console</small>
          </span>
        </NavLink>
        <div className="product-selector">
          <label htmlFor="product-selection">Product</label>
          <select
            id="product-selection"
            value={selectedProductId}
            onChange={(event) => {
              const productId = event.target.value;
              setSelectedProductId(productId);
              window.localStorage.setItem(SELECTED_PRODUCT_KEY, productId);
              window.dispatchEvent(new Event("product-selection-change"));
              navigate("/product");
            }}
          >
            <option value="new">New Product</option>
            {products.map((product) => (
              <option key={product.productId} value={product.productId}>
                CMVP-{String(product.productId).padStart(3, "0")}
              </option>
            ))}
          </select>
        </div>
        <div className="network-status">
          <span className={networkOnline ? "online" : ""} />
          {networkLabel} · CHAIN {NETWORK_CONFIG.chainId}
        </div>
        <AccountControl />
      </header>
      <div className="app-body">
        <aside className="sidebar">
          {(canUseAudit || canUseGovernance || canUseVoting) && (
            <>
              <p className="eyebrow">Lifecycle Control</p>
              <nav aria-label="Lifecycle control navigation">
                {canUseGovernance && (
                  <WorkflowTab
                    to="/governance"
                    number="01"
                    label="Governance"
                    enabled
                  />
                )}
                {canUseAudit && (
                  <WorkflowTab to="/audit" number="01" label="Audit" enabled />
                )}
                {canUseVoting && (
                  <WorkflowTab
                    to="/voting"
                    number={isParticipant ? "01" : "02"}
                    label="Voting"
                    enabled
                  />
                )}
                {canUseEscalations && (
                  <WorkflowTab
                    to="/escalations"
                    number={isParticipant ? "02" : "03"}
                    label="Escalations"
                    enabled
                  />
                )}
              </nav>
            </>
          )}
          <p className="eyebrow control-eyebrow">Product Foorprints</p>
          <nav aria-label="Primary navigation">
            <WorkflowTab
              to="/participants"
              number="01"
              label="Participants"
              enabled
            />
            <WorkflowTab
              to="/product"
              number="02"
              label="Product"
              enabled={participantsReady}
            />
            <WorkflowTab
              to="/events"
              number="03"
              label="Events"
              enabled={simulationReady}
            />
            <WorkflowTab
              to="/results"
              number="04"
              label="Results"
              enabled={simulationComplete}
            />
          </nav>
          <div className="sidebar-note">
            <span
              className={
                simulationComplete
                  ? "live-dot participants-ready"
                  : productReady
                  ? "live-dot ready"
                  : participantsReady
                  ? "live-dot participants-ready"
                  : "live-dot"
              }
            />
            <strong>
              {simulationComplete ? "Simulation Completed" : "Carbon Capture"}
            </strong>
          </div>
          {studiesComplete && (
            <button
              className="button secondary sidebar-reset"
              onClick={() => {
                window.localStorage.clear();
                window.location.assign("/participants");
              }}
            >
              Start New Simulation
            </button>
          )}
        </aside>
        <main className="main-content">
          <Routes>
            <Route path="/participants" element={<Participants />} />
            <Route
              path="/product"
              element={
                participantsReady ? (
                  <Product />
                ) : (
                  <Navigate to="/participants" replace />
                )
              }
            />
            <Route
              path="/events"
              element={
                simulationReady ? (
                  <Simulation />
                ) : (
                  <Navigate to="/participants" replace />
                )
              }
            />
            <Route
              path="/results"
              element={
                simulationComplete ? (
                  <Results />
                ) : (
                  <Navigate to="/events" replace />
                )
              }
            />
            <Route
              path="/governance"
              element={
                canUseGovernance ? (
                  <Governance />
                ) : (
                  <Navigate to="/voting" replace />
                )
              }
            />
            <Route path="/voting" element={<Voting />} />
            <Route
              path="/escalations"
              element={
                canUseEscalations ? (
                  <Audit initialTab="escalations" />
                ) : (
                  <Navigate to="/participants" replace />
                )
              }
            />
            <Route
              path="/audit"
              element={
                canUseAudit ? (
                  <Audit />
                ) : (
                  <Navigate to="/participants" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/participants" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
