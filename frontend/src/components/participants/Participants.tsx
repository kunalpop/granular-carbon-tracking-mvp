import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import { ACTOR_NAMES } from "../../services/getActors";
import { getSigner } from "../../services/getSigner";
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

export default function Actors() {
  const [actorFields, setActorFields] = useState<ActorField[]>(() =>
    loadCachedActors(),
  );
  const [actorsAdded, setActorsAdded] = useState(
    () => loadCachedActors().length > 0,
  );
  const [registering, setRegistering] = useState(false);

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
    if (actorsAdded || registering) return;

    setRegistering(true);

    const populated = Object.entries(ACTOR_NAMES).map(([role, name], i) => ({
      id: i + 1,
      name,
      role,
      address: getSigner(role as Parameters<typeof getSigner>[0]).address,
      stages: `${i + 1}`,
    }));

    try {
      await registerActors();
      if (!(await areActorsRegistered())) return;

      inMemoryActorCache = populated;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACTOR_CACHE_KEY, JSON.stringify(populated));
        window.dispatchEvent(new CustomEvent("actors-registration-change"));
      }
      setActorFields(populated);
      setActorsAdded(true);
    } finally {
      setRegistering(false);
    }
  };

  const visibleActors = actorFields;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">Participants</div>
          <h1>Register Participants On Chain</h1>
        </div>
        <p>
          Give every organisation a verifiable identity and explicit permission
          to write its lifecycle stage.
        </p>
      </div>
      <div className="section-grid">
        <section className="panel wide">
          <h2>Supply-chain actors</h2>
          <p>Configured participants in the laptop lifecycle simulation.</p>
          <div className="stage-list">
            {visibleActors.length === 0 ? (
              <p>
                No actors loaded yet. Press “Register Participants” to register.
              </p>
            ) : (
              visibleActors.map(({ id, name, role, stages }) => (
                <article className="card" key={role}>
                  <span className="card-id">{id}</span>
                  <strong>{name}</strong>
                  <small>
                    {role} · {stages}
                  </small>
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
                ? "PARTICIPANTS REGISTERED"
                : "REGISTER PARTICIPANTS"}
            </strong>
          </div>
          <div className="metric">
            {String(visibleActors.length).padStart(2, "0")}
          </div>
          <p>
            {actorsAdded
              ? "participants registered"
              : "input participants for the current lifecycle"}
          </p>

          <div className="action-row">
            <Button
              onClick={handleRegisterParticipants}
              disabled={actorsAdded || registering}
            >
              {registering
                ? "Registering..."
                : actorsAdded
                ? "Participants Registered"
                : "Register Participants"}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
