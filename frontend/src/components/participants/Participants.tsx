import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import { getSelectedRole, getSigner } from "../../services/getSigner";
import { clearSupplyChainIpfsCache, loadEmissionFactors, loadIpfsDocumentMetadata, loadSupplierRoleMap, type EmissionFactorLibrary, type IpfsDocumentMetadata, type SupplierRoleMap } from "../../services/supplyChainIpfs";
import { loadRegisteredParticipants } from "./getRegisteredParticipants";
import { registerActors } from "./registerParticipants";
import { uploadDocument } from "../../storage/uploadDocument";

type ActorField = {
  id: number;
  name: string;
  role: string;
  address: string;
  stages: string;
};

function buildActors(roleMap: SupplierRoleMap, factors: EmissionFactorLibrary): ActorField[] {
  const stagesByRole = new Map<string, number[]>();
  for (const stage of factors.stages) {
    stagesByRole.set(stage.actorRole, [...(stagesByRole.get(stage.actorRole) ?? []), stage.stageId]);
  }
  return Object.entries(roleMap).map(([role, name], index) => ({
    id: index + 1,
    name,
    role,
    address: (() => {
      try { return getSigner(role as Parameters<typeof getSigner>[0]).address; } catch { return ""; }
    })(),
    stages: (stagesByRole.get(role) ?? []).join(","),
  }));
}

export default function Participants() {
  const [actorFields, setActorFields] = useState<ActorField[]>([]);
  const [supplierRoleMap, setSupplierRoleMap] = useState<SupplierRoleMap>();
  const [factors, setFactors] = useState<EmissionFactorLibrary>();
  const [actorsAdded, setActorsAdded] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string>();
  const [configurationLoading, setConfigurationLoading] = useState(true);
  const [supplierFile, setSupplierFile] = useState<File>();
  const [emissionFactorsFile, setEmissionFactorsFile] = useState<File>();
  const [configurationUploading, setConfigurationUploading] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<"supplier" | "emissionFactors">();
  const [supplierUploadComplete, setSupplierUploadComplete] = useState(false);
  const [emissionFactorsUploadComplete, setEmissionFactorsUploadComplete] = useState(false);
  const [showConfigurationUpload, setShowConfigurationUpload] = useState(false);
  const [showConfiguration, setShowConfiguration] = useState(false);
  const [ipfsMetadata, setIpfsMetadata] = useState<IpfsDocumentMetadata[]>([]);
  const [configurationRevision, setConfigurationRevision] = useState(0);
  const [selectedRole, setSelectedRole] = useState(() => getSelectedRole());
  const isDeployer = selectedRole === "deployer";
  const configurationLoaded = Boolean(supplierRoleMap && factors);
  const canViewParticipants = selectedRole === "oem" || isDeployer;

  useEffect(() => {
    if (supplierUploadComplete && emissionFactorsUploadComplete) {
      setShowConfigurationUpload(false);
    }
  }, [supplierUploadComplete, emissionFactorsUploadComplete]);

  useEffect(() => {
    const updateRole = () => setSelectedRole(getSelectedRole());
    window.addEventListener("control-account-change", updateRole);
    return () => window.removeEventListener("control-account-change", updateRole);
  }, []);

  useEffect(() => {
    if (selectedRole !== "oem") return;
    void Promise.all([
      loadIpfsDocumentMetadata("role-participant-map.json"),
      loadIpfsDocumentMetadata("emission-factors.json"),
    ]).then(setIpfsMetadata).catch(() => setIpfsMetadata([]));
  }, [selectedRole, supplierUploadComplete, emissionFactorsUploadComplete, configurationRevision]);

  useEffect(() => {
    void Promise.all([loadSupplierRoleMap(), loadEmissionFactors()])
      .then(([roles, loadedFactors]) => {
        setSupplierRoleMap(roles);
        setFactors(loadedFactors);
        setActorFields(buildActors(roles, loadedFactors));
      })
      .catch(() => {
        // Initial absence is shown in the page status; it is not an upload error.
      })
      .finally(() => setConfigurationLoading(false));
  }, []);

  useEffect(() => {
    const verifyActors = async () => {
      try {
        const registered = await loadRegisteredParticipants();
        if (!registered) {
          setActorsAdded(false);
          if (!canViewParticipants && supplierRoleMap && factors) setActorFields(buildActors(supplierRoleMap, factors));
          return;
        }
        setActorFields(registered);
        setActorsAdded(true);
      } catch (cause) {
        setActorsAdded(false);
        // Configuration may be temporarily unavailable while the OEM upload is
        // being verified. The upload flow owns that status message.
        if (!(cause instanceof Error) || !cause.message.startsWith("IPFS configuration")) {
          setError(cause instanceof Error ? cause.message : "Unable to read registered participants from the chain.");
        }
      }
    };

    const refresh = () => void verifyActors();
    refresh();
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener("actors-registration-change", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("actors-registration-change", refresh);
    };
  }, [canViewParticipants, supplierRoleMap, factors]);

  const waitForConfigurationFile = async <T,>(loader: () => Promise<T>) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        return await loader();
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
    }
    throw new Error("File uploaded, but Pinata verification has not completed yet.");
  };

  const uploadConfigurationToIpfs = async (kind: "supplier" | "emissionFactors") => {
    const file = kind === "supplier" ? supplierFile : emissionFactorsFile;
    const complete = kind === "supplier" ? supplierUploadComplete : emissionFactorsUploadComplete;
    if (!file || selectedRole !== "oem" || configurationUploading || complete) return;
    setConfigurationUploading(true);
    setUploadingKind(kind);
    setError(undefined);
    let uploadSucceeded = false;
    try {
      const fileName = kind === "supplier" ? "role-participant-map.json" : "emission-factors.json";
      const purpose = kind === "supplier" ? "supplier-list" : "emission-factors";
      const configurationFile = new File([file], fileName, { type: "application/json" });
      await uploadDocument(configurationFile, getSigner("oem").address, { purpose });
      uploadSucceeded = true;
      // The document upload has succeeded. Lock this card immediately; the
      // follow-up read only refreshes the in-memory configuration data.
      if (kind === "supplier") setSupplierUploadComplete(true);
      else setEmissionFactorsUploadComplete(true);
      clearSupplyChainIpfsCache();
      setConfigurationRevision((revision) => revision + 1);
      if (kind === "supplier") {
        const roles = await waitForConfigurationFile(loadSupplierRoleMap);
        setSupplierRoleMap(roles);
        // Refresh factors as well when available so the stage cards are
        // rebuilt from the latest pair of IPFS configuration files.
        try {
          const loadedFactors = await waitForConfigurationFile(loadEmissionFactors);
          setFactors(loadedFactors);
          setActorFields(buildActors(roles, loadedFactors));
        } catch {
          if (factors) setActorFields(buildActors(roles, factors));
        }
      } else {
        const loadedFactors = await waitForConfigurationFile(loadEmissionFactors);
        setFactors(loadedFactors);
        try {
          const roles = await waitForConfigurationFile(loadSupplierRoleMap);
          setSupplierRoleMap(roles);
          setActorFields(buildActors(roles, loadedFactors));
        } catch {
          if (supplierRoleMap) setActorFields(buildActors(supplierRoleMap, loadedFactors));
        }
      }
      setError(undefined);
      window.dispatchEvent(new Event("supply-chain-config-uploaded"));
    } catch (cause) {
      if (!uploadSucceeded) {
        setError(cause instanceof Error ? cause.message : "Configuration upload failed.");
      }
    } finally {
      setConfigurationUploading(false);
      setUploadingKind(undefined);
    }
  };

  const handleRegisterParticipants = async () => {
    if (!isDeployer || actorsAdded || registering || !configurationLoaded) return;

    setRegistering(true);
    setError(undefined);

    try {
      const [roles, loadedFactors] = await Promise.all([loadSupplierRoleMap(), loadEmissionFactors()]);
      const actors = buildActors(roles, loadedFactors);
      setActorFields(actors);
      await registerActors(actors);

      window.dispatchEvent(new CustomEvent("actors-registration-change"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Participant registration failed.");
    } finally {
      setRegistering(false);
    }
  };

  const updateActor = (id: number, field: keyof ActorField, value: string) => {
    setActorFields((current) => current.map((actor) =>
      actor.id === id ? { ...actor, [field]: value } : actor,
    ));
  };

  // Auditor is a governance account, not a lifecycle-stage participant.
  const stageCards = (factors?.stages ?? []).map((stage) => ({
    stage,
    actor: actorFields.find((actor) => actor.role === stage.actorRole),
  }));

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">Participants</div>
          <h1>Register Participants</h1>
        </div>
      </div>
      {selectedRole === "oem" && (
        <div className="configuration-upload-toggle-row">
          {!(supplierUploadComplete && emissionFactorsUploadComplete) && <Button onClick={() => setShowConfigurationUpload((visible) => !visible)}>
            {showConfigurationUpload ? "Hide Upload Option" : "Upload Configuration Files"}
          </Button>}
        </div>
      )}
      {selectedRole === "oem" && showConfigurationUpload && !(supplierUploadComplete && emissionFactorsUploadComplete) && (
        <section className="panel configuration-panel">
          <h2>Upload supply-chain configuration to IPFS</h2>
          <div className="configuration-upload-grid">
              <label className={`configuration-upload-card${supplierUploadComplete ? " configuration-upload-card-locked" : ""}`}>
                <span className="configuration-upload-icon" aria-hidden="true">JSON</span>
                <span className="configuration-upload-copy">
                  <strong>Supplier list</strong>
                  <small>{supplierFile?.name ?? "No file selected"}</small>
                </span>
                <span className="configuration-browse-button">Browse file</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={supplierUploadComplete}
                  onChange={(event) => {
                    setSupplierFile(event.target.files?.[0]);
                  }}
                />
                <Button onClick={() => void uploadConfigurationToIpfs("supplier")} disabled={!supplierFile || configurationUploading || supplierUploadComplete}>
                  {uploadingKind === "supplier" ? "Uploading..." : supplierUploadComplete ? "Uploaded" : "Upload"}
                </Button>
              </label>
              <label className={`configuration-upload-card${emissionFactorsUploadComplete ? " configuration-upload-card-locked" : ""}`}>
                <span className="configuration-upload-icon" aria-hidden="true">JSON</span>
                <span className="configuration-upload-copy">
                  <strong>Emission factors</strong>
                  <small>{emissionFactorsFile?.name ?? "No file selected"}</small>
                </span>
                <span className="configuration-browse-button">Browse file</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={emissionFactorsUploadComplete}
                  onChange={(event) => {
                    setEmissionFactorsFile(event.target.files?.[0]);
                  }}
                />
                <Button onClick={() => void uploadConfigurationToIpfs("emissionFactors")} disabled={!emissionFactorsFile || configurationUploading || emissionFactorsUploadComplete}>
                  {uploadingKind === "emissionFactors" ? "Uploading..." : emissionFactorsUploadComplete ? "Uploaded" : "Upload"}
                </Button>
              </label>
          </div>
        </section>
      )}
      <div className="section-grid">
        <section className="panel wide">
          <h2>Supply-chain Participants</h2>
          {canViewParticipants ? (
            <>

              <div className="stage-list">
                {stageCards.length === 0 ? (
                  <p>
                    {configurationLoading
                      ? "Loading participant and emission-factor configuration from IPFS..."
                      : isDeployer && configurationLoaded
                        ? "No participants loaded yet. Press “Register Participants” to register."
                        : "No participant list is available in IPFS yet."}
                  </p>
                ) : (
                  stageCards.map(({ stage, actor }) => (
                      <article className="card participant-card" key={stage.stageId}>
                        <span className="card-id">{String(stage.stageId).padStart(2, "0")}</span>
                        {([['Name', 'name', actor?.name ?? supplierRoleMap?.[stage.actorRole] ?? stage.actorRole], ['Role', 'role', stage.actorRole], ['Stage', 'stages', String(stage.stageId)]] as const).map(([label, field, value]) => (
                          <div className="participant-field" key={field}>
                            <span>{label}</span>
                            {actorsAdded ? <span className="participant-value">{value}</span> : (
                              <input value={value} onChange={(event) => actor && updateActor(actor.id, field, event.target.value)} disabled={!isDeployer || registering} />
                            )}
                          </div>
                        ))}
                      </article>
                    ))
                )}
              </div>
            </>
          ) : (
            <p>{actorsAdded ? "Participants registered." : "Participants are not yet registered."}</p>
          )}
        </section>
        <section className="panel narrow">
          <div
            className={`product-status ${
              actorsAdded ? "participants-registered" : "ready-to-register"
            }`}
          >
            <span
              className={
                actorsAdded ? "live-dot ready" : "live-dot"
              }
            />
            <strong>
              {actorsAdded
                ? "Participants registered"
                : isDeployer
                ? "Register participants"
                : "Participants not yet registered"}
            </strong>
          </div>
          {canViewParticipants && (
            <div className="metric">
              {String(stageCards.length).padStart(2, "0")}
            </div>
          )}
          {isDeployer && (
          <div className="action-row">
            <Button
              onClick={handleRegisterParticipants}
              disabled={!isDeployer || actorsAdded || registering || !configurationLoaded}
            >
              {registering
                ? "Registering..."
                : actorsAdded
                ? "Participants Registered"
                : "Register Participants"}
            </Button>
          </div>
          )}
          {selectedRole === "oem" && (
            <div className="configuration-summary">
              <Button className="secondary" onClick={() => setShowConfiguration((visible) => !visible)}>
                {showConfiguration ? "Hide Configuration" : "Configuration"}
              </Button>
              {showConfiguration && (
                <div className="configuration-summary-card">
                  <h3>Configuration</h3>
                  {ipfsMetadata.map((document) => (
                    <div className="configuration-document" key={document.originalFileName}>
                      <span><strong>Name</strong> {document.originalFileName}</span>
                      <span><strong>Version</strong> {document.originalFileName === "emission-factors.json" ? `${factors?.libraryVersion ?? "—"} (schema ${factors?.schemaVersion ?? "—"})` : "—"}</span>
                      <span><strong>Date</strong> {document.createdAt && !Number.isNaN(Date.parse(document.createdAt)) ? new Date(document.createdAt).toLocaleString() : "—"}</span>
                    </div>
                  ))}
                  {ipfsMetadata.length === 0 && <p>Configuration metadata is unavailable.</p>}
                </div>
              )}
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </>
  );
}
