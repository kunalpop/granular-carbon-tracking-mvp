import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Participants from "./components/participants/Participants";
import Product from "./components/product/Product";
import Simulation from "./components/events/Events";
import Results from "./components/result/Results";
import Governance from "./components/control/Governance";
import Audit from "./components/control/Audit";
import AccountControl from "./components/control/AccountControl";
import { NETWORK_CONFIG } from "./services/networkConfig";
import { getSelectedRole, type AccountRole } from "./services/getSigner";
import "./App.css";

const ACTOR_CACHE_KEY = "registered-actors-cache";
const PRODUCT_CACHE_KEY = "registered-product-cache";
const SIMULATION_EVENTS_CACHE_KEY = "registered-emission-events-cache";
const SIMULATION_EVENT_COUNT = 10;
const STUDIES_COMPLETE_CACHE_KEY = "evaluation-studies-complete";

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
  const [participantsReady, setParticipantsReady] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.localStorage.getItem(ACTOR_CACHE_KEY));
  });
  const [productReady, setProductReady] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.localStorage.getItem(PRODUCT_CACHE_KEY));
  });
  const [simulationComplete, setSimulationComplete] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const events = JSON.parse(
        window.localStorage.getItem(SIMULATION_EVENTS_CACHE_KEY) ?? "[]",
      ) as unknown[];
      return events.length >= SIMULATION_EVENT_COUNT;
    } catch {
      return false;
    }
  });
  const [studiesComplete, setStudiesComplete] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STUDIES_COMPLETE_CACHE_KEY) === "true";
  });
  const simulationReady = participantsReady && productReady;
  const [networkOnline, setNetworkOnline] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AccountRole>(() => getSelectedRole());
  const canUseLifecycleControl = selectedRole === "deployer" || selectedRole === "auditor";
  const networkLabel = NETWORK_CONFIG.url.includes("8545") ? "BESU" : "CHAIN";

  useEffect(() => {
    const updateRole = () => setSelectedRole(getSelectedRole());
    window.addEventListener("control-account-change", updateRole);
    return () => window.removeEventListener("control-account-change", updateRole);
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
    const syncStatus = () => {
      if (typeof window === "undefined") {
        setParticipantsReady(false);
        return;
      }

      setParticipantsReady(
        Boolean(window.localStorage.getItem(ACTOR_CACHE_KEY)),
      );
      setProductReady(Boolean(window.localStorage.getItem(PRODUCT_CACHE_KEY)));
      try {
        const events = JSON.parse(
          window.localStorage.getItem(SIMULATION_EVENTS_CACHE_KEY) ?? "[]",
        ) as unknown[];
        setSimulationComplete(events.length >= SIMULATION_EVENT_COUNT);
      } catch {
        setSimulationComplete(false);
      }
      setStudiesComplete(
        window.localStorage.getItem(STUDIES_COMPLETE_CACHE_KEY) === "true",
      );
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === ACTOR_CACHE_KEY ||
        event.key === PRODUCT_CACHE_KEY ||
        event.key === SIMULATION_EVENTS_CACHE_KEY ||
        event.key === STUDIES_COMPLETE_CACHE_KEY
      ) {
        syncStatus();
      }
    };

    const handleRegistrationChange = () => syncStatus();

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
      "simulation-registration-change",
      handleRegistrationChange,
    );
    window.addEventListener("studies-complete", handleRegistrationChange);

    syncStatus();

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
        <div className="network-status">
          <span className={networkOnline ? "online" : ""} />
          {networkLabel} · CHAIN {NETWORK_CONFIG.chainId}
        </div>
        <AccountControl />
      </header>
      <div className="app-body">
        <aside className="sidebar">
          {canUseLifecycleControl && (
            <>
          <p className="eyebrow">Lifecycle Control</p>
          <nav aria-label="Lifecycle control navigation">
            <WorkflowTab to="/audit" number="01" label="Audit" enabled />
            <WorkflowTab
              to="/governance"
              number="02"
              label="Governance"
              enabled
            />
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
            <Route path="/governance" element={<Governance />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="*" element={<Navigate to="/participants" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
