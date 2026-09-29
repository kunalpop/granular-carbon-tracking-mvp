import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import { ACTOR_NAMES } from "../../services/getParticipants";
import { getSelectedRole, getSigner } from "../../services/getSigner";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
import { loadRegisteredParticipants } from "./getRegisteredParticipants";
import { registerActors } from "./registerParticipants";

type ActorField = {
  id: number;
  name: string;
  role: string;
  address: string;
  stages: string;
};

function getDefaultActors(): ActorField[] {
  return Object.entries(ACTOR_NAMES).map(([role, name], i) => ({
    id: i + 1,
    name,
    role,
    address: getSigner(role as Parameters<typeof getSigner>[0]).address,
    stages: String(i + 1),
  }));
}

export default function Participants() {
  const [actorFields, setActorFields] = useState<ActorField[]>(getDefaultActors);
  const [actorsAdded, setActorsAdded] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedRole, setSelectedRole] = useState(() => getSelectedRole());
  const isDeployer = selectedRole === "deployer";

  useEffect(() => {
    const updateRole = () => setSelectedRole(getSelectedRole());
    window.addEventListener("control-account-change", updateRole);
    return () => window.removeEventListener("control-account-change", updateRole);
  }, []);

  useEffect(() => {
    const verifyActors = async () => {
      try {
        const registered = await loadRegisteredParticipants();
        if (!registered) {
          setActorsAdded(false);
          return;
        }
        setActorFields(registered);
        setActorsAdded(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to load registered participants.");
      }
    };
    void verifyActors();
  }, []);

  const handleRegisterParticipants = async () => {
    if (!isDeployer || actorsAdded || registering) return;

    setRegistering(true);
    setError(undefined);

    try {
      await registerActors(actorFields);

      window.dispatchEvent(new CustomEvent("actors-registration-change"));
      setActorsAdded(true);
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
  const stageCards = EMISSION_FACTORS.stages.map((stage) => ({
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
      <div className="section-grid">
        <section className="panel wide">
          <h2>Supply-chain Participants</h2>
          <p>Configured participants in the laptop lifecycle simulation.</p>
          <div className="stage-list">
            {stageCards.length === 0 ? (
              <p>
                No participants loaded yet. Press “Register Participants” to
                register.
              </p>
            ) : (
              stageCards.map(({ stage, actor }) => (
                  <article className="card participant-card" key={stage.stageId}>
                    <span className="card-id">{String(stage.stageId).padStart(2, "0")}</span>
                    {([['Name', 'name', actor?.name ?? ACTOR_NAMES[stage.actorRole] ?? stage.actorRole], ['Role', 'role', stage.actorRole], ['Stage', 'stages', String(stage.stageId)]] as const).map(([label, field, value]) => (
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
        </section>
        <section className="panel narrow">
          <div
            className={`product-status ${
              actorsAdded ? "participants-registered" : "ready-to-register"
            }`}
          >
            <span
              className={
                actorsAdded ? "live-dot participants-ready" : "live-dot"
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
          {(isDeployer || actorsAdded) && (
            <div className="metric">
              {String(stageCards.length).padStart(2, "0")}
            </div>
          )}
          {isDeployer && (
          <div className="action-row">
            <Button
              onClick={handleRegisterParticipants}
              disabled={!isDeployer || actorsAdded || registering}
            >
              {registering
                ? "Registering..."
                : actorsAdded
                ? "Participants Registered"
                : "Register Participants"}
            </Button>
          </div>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </>
  );
}
