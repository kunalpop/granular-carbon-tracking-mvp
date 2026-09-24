import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import { ACTOR_NAMES } from "../../services/getParticipants";
import { getSelectedRole, getSigner } from "../../services/getSigner";
import { areActorsRegistered, registerActors } from "./registerParticipants";

type ActorField = {
  id: number;
  name: string;
  role: string;
  address: string;
  stages: string;
};

const ACTOR_CACHE_KEY = "registered-actors-cache";
let inMemoryActorCache: ActorField[] | null = null;

function loadCachedActors(): ActorField[] {
  if (inMemoryActorCache) return inMemoryActorCache;

  if (typeof window === "undefined") return [];

  try {
    const saved = window.localStorage.getItem(ACTOR_CACHE_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved) as ActorField[];
    inMemoryActorCache = parsed;
    return parsed;
  } catch {
    return [];
  }
}

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
  const [actorFields, setActorFields] = useState<ActorField[]>(() =>
    loadCachedActors().length > 0 ? loadCachedActors() : getDefaultActors(),
  );
  const [actorsAdded, setActorsAdded] = useState(
    () => loadCachedActors().length > 0,
  );
  const [registering, setRegistering] = useState(false);
  const [selectedRole, setSelectedRole] = useState(() => getSelectedRole());
  const isDeployer = selectedRole === "deployer";

  useEffect(() => {
    const updateRole = () => setSelectedRole(getSelectedRole());
    window.addEventListener("control-account-change", updateRole);
    return () => window.removeEventListener("control-account-change", updateRole);
  }, []);

  useEffect(() => {
    const verifyActors = async () => {
      if (!(await areActorsRegistered())) {
        setActorsAdded(false);
        return;
      }
      const cached = loadCachedActors();
      if (cached.length > 0) {
        setActorFields(cached);
        setActorsAdded(true);
      }
    };
    void verifyActors();
  }, []);

  const handleRegisterParticipants = async () => {
    if (!isDeployer || actorsAdded || registering) return;

    setRegistering(true);

    try {
      await registerActors(actorFields);
      if (!(await areActorsRegistered())) return;

      inMemoryActorCache = actorFields;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          ACTOR_CACHE_KEY,
          JSON.stringify(actorFields),
        );
        window.dispatchEvent(new CustomEvent("actors-registration-change"));
      }
      setActorsAdded(true);
    } finally {
      setRegistering(false);
    }
  };

  const updateActor = (id: number, field: keyof ActorField, value: string) => {
    setActorFields((current) => current.map((actor) =>
      actor.id === id ? { ...actor, [field]: value } : actor,
    ));
  };

  const visibleActors = actorFields;
  const canViewParticipants = isDeployer || actorsAdded;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">Participants</div>
          <h1>Register Participant On Chain</h1>
        </div>
        <p>
          Give every organisation a verifiable identity and explicit permission
          to write its lifecycle stage.
        </p>
      </div>
      <div className="section-grid">
        <section className="panel wide">
          {canViewParticipants ? (
            <>
              <h2>Supply-chain Participants</h2>
              <p>Configured participants in the laptop lifecycle simulation.</p>
              <div className="stage-list">
                {visibleActors.map(({ id, name, role, stages }) => (
                  <article className="card participant-card" key={id}>
                    <span className="card-id">{id}</span>
                    {([['Name', 'name', name], ['Role', 'role', role], ['Stages', 'stages', stages]] as const).map(([label, field, value]) => (
                      <div className="participant-field" key={field}>
                        <span>{label}</span>
                        {actorsAdded ? (
                          <span className="participant-value">{value}</span>
                        ) : (
                          <input
                            value={value}
                            onChange={(event) => updateActor(id, field, event.target.value)}
                            disabled={!isDeployer || registering}
                          />
                        )}
                      </div>
                    ))}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p>Participant details will be available after registration.</p>
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
                actorsAdded ? "live-dot participants-ready" : "live-dot"
              }
            />
            <strong>
              {actorsAdded
                ? "PARTICIPANTS REGISTERED"
                : "REGISTER PARTICIPANTS"}
            </strong>
          </div>
          {canViewParticipants && (
            <>
              <div className="metric">
                {String(visibleActors.length).padStart(2, "0")}
              </div>
              <p>
                {actorsAdded
                  ? "participants registered"
                  : "input participants for the current lifecycle"}
              </p>
            </>
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
        </section>
      </div>
    </>
  );
}
